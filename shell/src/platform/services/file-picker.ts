import type { FileModule, FileOptions } from "@sewa/host-platform";

export function getFallbackMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export function filePicker(options?: FileOptions): Promise<FileModule[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? false;

    if (options?.accept?.length) {
      input.accept = options.accept.join(",");
    }
    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        return reject(new Error("No files selected"));
      }
      const results: FileModule[] = Array.from(input.files).map((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() || "";

        const blobUrl = URL.createObjectURL(file);

        return {
          url: blobUrl,
          previewUrl: blobUrl,
          fileName: file.name,
          mimeType: file.type || getFallbackMimeType(extension),
          extension: extension,
          byteSize: file.size,
        };
      });

      resolve(results);
    };

    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            reject(new Error("File picker closed."));
          }
        }, 300);
      },
      { once: true },
    );
    input.click();
  });
}
