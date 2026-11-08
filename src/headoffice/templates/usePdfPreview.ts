import { useEffect, useRef, useState } from "react";

/**
 * A PDF fetched for an <iframe>. The address shown stays valid until the next PDF has
 * arrived (dropping it earlier makes the browser show «couldn't load the file»), and an
 * answer that is not a PDF is reported instead of being shown.
 */
export function usePdfPreview(load: ((signal: AbortSignal) => Promise<Blob>) | null, key: string) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; error: string }>({ url: null, loading: false, error: "" });
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    load(controller.signal)
      .then(async (blob) => {
        const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...head) !== "%PDF-") throw new Error("not a pdf");
        const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        const previous = shown.current;
        shown.current = url;
        setState({ url, loading: false, error: "" });
        // The old file is released once the new one is on screen.
        if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 10_000);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: "تعذّر تجهيز المعاينة. اضغط «تحديث» أو راجعها من «معاينة PDF»." }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, Boolean(load)]);

  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );
  return state;
}
