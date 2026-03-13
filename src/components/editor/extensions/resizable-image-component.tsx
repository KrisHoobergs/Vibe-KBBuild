"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/utils";

export function ResizableImageComponent({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const isEditable = editor.isEditable;
  const { src, alt, title, width } = node.attrs;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!imgRef.current) return;
      startX.current = e.clientX;
      startWidth.current = imgRef.current.offsetWidth;
      setResizing(true);
    },
    []
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      if (imgRef.current) {
        imgRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      setResizing(false);
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      updateAttributes({ width: Math.round(newWidth) });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle="">
      <div
        className={cn(
          "resizable-image-container",
          "relative inline-block",
          isEditable && (selected || resizing) && "ring-2 ring-primary/50 rounded-md",
        )}
        style={{ width: width ? `${width}px` : undefined, maxWidth: "100%" }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ""}
          title={title || undefined}
          className="rounded-md block"
          style={{ width: "100%", height: "auto" }}
          draggable={false}
        />
        {isEditable && (
          <>
            <div
              className="resize-handle resize-handle-br"
              onMouseDown={handleMouseDown}
            />
            <div
              className="resize-handle resize-handle-bl"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!imgRef.current) return;
                startX.current = e.clientX;
                startWidth.current = imgRef.current.offsetWidth;
                setResizing(true);
                // For left handle, invert the diff direction
                const origStartX = e.clientX;
                const origWidth = imgRef.current.offsetWidth;

                const onMove = (ev: MouseEvent) => {
                  const diff = origStartX - ev.clientX;
                  const newWidth = Math.max(50, origWidth + diff);
                  if (imgRef.current) {
                    imgRef.current.style.width = `${newWidth}px`;
                  }
                };
                const onUp = (ev: MouseEvent) => {
                  setResizing(false);
                  const diff = origStartX - ev.clientX;
                  const newWidth = Math.max(50, origWidth + diff);
                  updateAttributes({ width: Math.round(newWidth) });
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
