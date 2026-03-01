"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Toolbar } from "./toolbar";
import { editorExtensions } from "./extensions";
import { uploadArticleImage, uploadArticleVideo } from "@/actions/upload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface TiptapEditorProps {
  content: Record<string, unknown>;
  onChange: (json: Record<string, unknown>, text: string) => void;
  articleId?: string;
  editable?: boolean;
}

export function TiptapEditor({
  content,
  onChange,
  articleId,
  editable = true,
}: TiptapEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: Object.keys(content).length > 0 ? content : undefined,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as Record<string, unknown>, editor.getText());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[400px] rounded-b-md border p-4 focus:outline-none",
      },
    },
  });

  // Zorg dat content correct wordt geladen bij bestaande artikelen
  const contentApplied = useRef(false);
  useEffect(() => {
    if (editor && !editor.isDestroyed && !contentApplied.current && Object.keys(content).length > 0) {
      const currentContent = editor.getJSON();
      if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
        editor.commands.setContent(content);
      }
      contentApplied.current = true;
    }
  }, [editor, content]);

  const handleImageUpload = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      setUploading(true);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("articleId", articleId ?? "temp");

      const result = await uploadArticleImage(formData);
      if (result.success && result.data) {
        editor.chain().focus().setImage({ src: result.data.url }).run();
      } else {
        toast.error(result.error ?? "Fout bij uploaden van afbeelding");
      }
      setUploading(false);

      // Reset input
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    },
    [editor, articleId]
  );

  const handleVideoEmbed = useCallback(() => {
    setVideoDialogOpen(true);
  }, []);

  const insertVideoEmbed = useCallback(
    (url: string) => {
      if (!editor || !url) return;

      // Detect YouTube/Vimeo and convert to embed URL
      let embedUrl = url;
      const youtubeMatch = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/
      );
      const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);

      if (youtubeMatch) {
        embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
      } else if (vimeoMatch) {
        embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      }

      // Insert as HTML with an iframe
      editor
        .chain()
        .focus()
        .insertContent(
          `<div data-video-embed="true" class="my-4"><iframe src="${embedUrl}" width="100%" height="400" frameborder="0" allowfullscreen style="border-radius: 8px; aspect-ratio: 16/9;"></iframe></div>`
        )
        .run();

      setVideoUrl("");
      setVideoDialogOpen(false);
    },
    [editor]
  );

  const handleVideoFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      setUploading(true);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("articleId", articleId ?? "temp");

      const result = await uploadArticleVideo(formData);
      if (result.success && result.data) {
        editor
          .chain()
          .focus()
          .insertContent(
            `<div data-video-upload="true" class="my-4"><video controls src="${result.data.url}" style="width: 100%; border-radius: 8px;"></video></div>`
          )
          .run();
        setVideoDialogOpen(false);
      } else {
        toast.error(result.error ?? "Fout bij uploaden van video");
      }
      setUploading(false);

      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    },
    [editor, articleId]
  );

  if (!editor) return null;

  return (
    <div>
      {editable && (
        <Toolbar
          editor={editor}
          onImageUpload={handleImageUpload}
          onVideoEmbed={handleVideoEmbed}
        />
      )}
      <EditorContent editor={editor} />

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleImageSelected}
      />

      {/* Video dialog */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Video invoegen</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="embed">
            <TabsList className="w-full">
              <TabsTrigger value="embed" className="flex-1">
                YouTube/Vimeo link
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">
                Video uploaden
              </TabsTrigger>
            </TabsList>
            <TabsContent value="embed" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="video-url">Video URL</Label>
                <Input
                  id="video-url"
                  placeholder="https://youtube.com/watch?v=... of https://vimeo.com/..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      insertVideoEmbed(videoUrl);
                    }
                  }}
                />
              </div>
              <Button
                onClick={() => insertVideoEmbed(videoUrl)}
                disabled={!videoUrl.trim()}
              >
                Invoegen
              </Button>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4">
              <div className="space-y-2">
                <Label>Video bestand</Label>
                <Input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  onChange={handleVideoFileUpload}
                />
                <p className="text-xs text-muted-foreground">
                  MP4, WebM of OGG. Maximaal 50MB.
                </p>
              </div>
              {uploading && (
                <p className="text-sm text-muted-foreground">
                  Video wordt geüpload...
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {uploading && (
        <p className="mt-1 text-xs text-muted-foreground">
          Bestand wordt geüpload...
        </p>
      )}
    </div>
  );
}
