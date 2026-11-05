import { Converter } from "./vendor/opencc-full.js";
const convert = Converter({ from: "tw", to: "cn" }),
  originalFetch = globalThis.fetch.bind(globalThis);
const root = new URL("./", import.meta.url);
const asset = (name) => new URL(name.replace(/^\//, ""), root).href;
let manifest = null;
async function prepareFetch() {
  manifest = await originalFetch(asset("models/manifest.json")).then((r) => r.json());
  globalThis.fetch = async (input, init) => {
    const url = new URL(
        typeof input === "string" ? input : input.url,
        location.origin,
      ),
      entry = url.origin === root.origin && url.pathname.startsWith(root.pathname) ? manifest["/" + url.pathname.slice(root.pathname.length)] : null;
    if (!entry) return originalFetch(input, init);
    let index = 0,
      reader;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          while (!reader) {
            if (index >= entry.parts.length) {
              controller.close();
              return;
            }
            const r = await originalFetch(asset(entry.parts[index++]), init);
            if (!r.ok) throw Error("模型文件读取失败");
            reader = r.body.getReader();
          }
          const chunk = await reader.read();
          if (chunk.done) {
            reader = null;
            return this.pull(controller);
          }
          controller.enqueue(chunk.value);
        } catch (e) {
          controller.error(e);
        }
      },
      cancel() {
        return reader?.cancel();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-length": String(entry.size),
        "content-type": "application/octet-stream",
      },
    });
  };
}
function wavAudio(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 44) throw Error("音频数据为空");
  let at = 12,
    channels = 0,
    rate = 0,
    bits = 0,
    offset = -1,
    length = 0;
  while (at + 8 <= v.byteLength) {
    const name = String.fromCharCode(...new Uint8Array(buffer, at, 4)),
      size = v.getUint32(at + 4, true);
    if (name === "fmt ") {
      channels = v.getUint16(at + 10, true);
      rate = v.getUint32(at + 12, true);
      bits = v.getUint16(at + 22, true);
    }
    if (name === "data") {
      offset = at + 8;
      length = Math.min(size, v.byteLength - offset);
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (rate !== 16000 || channels !== 1 || bits !== 16 || offset < 0)
    throw Error("转写需要16kHz单声道PCM音频");
  const audio = new Float32Array(Math.floor(length / 2));
  for (let i = 0; i < audio.length; i++)
    audio[i] = v.getInt16(offset + i * 2, true) / 32768;
  return audio;
}
const normText = (s) =>
  String(s || "").replace(
    /[\s，。、！？!?.,;；:：""''「」『』（）()《》\-—…]/g,
    "",
  );
function similarText(a, b) {
  const x = normText(a),
    y = normText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}

function normalizeChunks(out, offset) {
  const res = [];
  const chunks = Array.isArray(out?.chunks) ? out.chunks : null;
  if (chunks && chunks.length) {
    for (const c of chunks) {
      const [start, end] = c.timestamp || [null, null];
      if (start === null || start === undefined) continue;
      res.push({
        start: +(start + offset).toFixed(2),
        end: +((end ?? start) + offset).toFixed(2),
        text: (c.text || "").trim(),
      });
    }
  }
  if (!res.length && out?.text) {
    res.push({
      start: +offset.toFixed(2),
      end: null,
      text: String(out.text).trim(),
    });
  }
  return res.filter((x) => x.text);
}

onmessage = async ({ data }) => {
  const startTime = Date.now();
  try {
    const audio = wavAudio(data.wav),
      durationS = audio.length / 16000;
    if (durationS > 1200) throw Error("单次转写最多20分钟");
    await prepareFetch();
    const { pipeline, env } = await import(asset("vendor/transformers.min.js"));
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = asset("models/");
    env.useBrowserCache = true;
    env.useFSCache = false;
    env.backends.onnx.wasm.wasmPaths = asset("vendor/");
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    const last = new Map();
    const pipe = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p) => {
          const now = Date.now(),
            prev = last.get(p.file) || 0;
          if (p.status === "progress" && now - prev < 200) return;
          last.set(p.file, now);
          postMessage({
            type: "progress",
            stage: "load",
            file: p.file,
            status: p.status,
            progress:
              typeof p.progress === "number" ? p.progress / 100 : undefined,
            loaded: p.loaded,
            total: p.total,
          });
        },
      },
    );
    const segments = [];
    for (let at = 0; at < audio.length; at += 400000) {
      const end = Math.min(at + 480000, audio.length),
        out = await pipe(audio.subarray(at, end), {
          language: "chinese",
          task: "transcribe",
          return_timestamps: true,
          chunk_length_s: 30,
        }),
        part = normalizeChunks(out, at / 16000).map((g) => ({
          ...g,
          text: convert(g.text),
        }));
      const kept = part.filter(
        (g) =>
          !segments
            .slice(-8)
            .some(
              (p) =>
                Math.abs(p.start - g.start) < 0.6 ||
                (Math.abs(p.start - g.start) < 7 &&
                  similarText(p.text, g.text)),
            ),
      );
      segments.push(...kept);
      for (const g of kept) postMessage({ type: "partial", ...g });
      postMessage({
        type: "progress",
        stage: "transcribe",
        progress: end / audio.length,
      });
      if (end >= audio.length) break;
    }
    await pipe.dispose?.();
    const elapsedMs = Date.now() - startTime;
    postMessage({
      type: "done",
      json: {
        durationS,
        model: "onnx-community/whisper-base",
        elapsedMs,
        speedup: durationS / (elapsedMs / 1000),
        text: segments.map((s) => s.text).join(" "),
        segments,
      },
    });
  } catch (e) {
    postMessage({ type: "error", message: e.message || "转写失败" });
  }
};
