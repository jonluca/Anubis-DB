import { InputLimitError, MAX_REQUEST_BODY_BYTES } from "./inputLimits";

const readBody = async (request: Request): Promise<string> => {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BODY_BYTES) {
    void request.body?.cancel().catch(() => {});
    throw new InputLimitError("Request body exceeds 3 MB");
  }
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  let bytes = new Uint8Array(16_384);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const nextLength = length + value.byteLength;
      if (nextLength > MAX_REQUEST_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new InputLimitError("Request body exceeds 3 MB");
      }
      if (nextLength > bytes.length) {
        const expanded = new Uint8Array(
          Math.min(
            MAX_REQUEST_BODY_BYTES,
            Math.max(nextLength, bytes.length * 2),
          ),
        );
        expanded.set(bytes.subarray(0, length));
        bytes = expanded;
      }
      bytes.set(value, length);
      length = nextLength;
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(bytes.subarray(0, length));
};

export const parseBody = async (request: Request): Promise<unknown> => {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const textBody = await readBody(request);
  if (contentType.includes("application/json")) {
    return JSON.parse(textBody);
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const fields: Record<string, string> = Object.create(null);
    let start = 0;
    let count = 0;
    // Parse one field at a time so a body of tiny repeated fields cannot create
    // millions of URLSearchParams entries before we validate the submission.
    while (start < textBody.length) {
      count += 1;
      if (count > 100) {
        throw new InputLimitError("Submit at most 100 form fields");
      }
      const separator = textBody.indexOf("&", start);
      const end = separator === -1 ? textBody.length : separator;
      for (const [key, value] of new URLSearchParams(
        textBody.slice(start, end),
      )) {
        fields[key] = value;
      }
      start = end + 1;
    }
    return fields;
  }
  if (!textBody) {
    return {};
  }
  try {
    return JSON.parse(textBody);
  } catch {
    return { subdomains: textBody };
  }
};
