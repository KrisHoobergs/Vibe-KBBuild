"use client";

import { type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  ImageIcon,
  Video,
  Link as LinkIcon,
  Undo,
  Redo,
  FileCode,
  Palette,
  Highlighter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TEXT_COLORS = [
  { name: "Zwart", value: "#000000" },
  { name: "Donkergrijs", value: "#4B5563" },
  { name: "Grijs", value: "#9CA3AF" },
  { name: "Rood", value: "#DC2626" },
  { name: "Oranje", value: "#EA580C" },
  { name: "Geel", value: "#CA8A04" },
  { name: "Groen", value: "#16A34A" },
  { name: "Blauw", value: "#2563EB" },
  { name: "Paars", value: "#9333EA" },
  { name: "Roze", value: "#DB2777" },
];

const HIGHLIGHT_COLORS = [
  { name: "Geel", value: "#FEF08A" },
  { name: "Groen", value: "#BBF7D0" },
  { name: "Blauw", value: "#BFDBFE" },
  { name: "Paars", value: "#DDD6FE" },
  { name: "Roze", value: "#FBCFE8" },
  { name: "Oranje", value: "#FED7AA" },
  { name: "Rood", value: "#FECACA" },
  { name: "Grijs", value: "#E5E7EB" },
];

interface ToolbarProps {
  editor: Editor;
  onImageUpload: () => void;
  onVideoEmbed: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  tooltip,
  children,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 w-8 p-0", isActive && "bg-accent")}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({ editor, onImageUpload, onVideoEmbed }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-background p-1">
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        tooltip="Ongedaan maken"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        tooltip="Opnieuw"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        tooltip="Kop 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        tooltip="Kop 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        tooltip="Kop 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        tooltip="Vet"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        tooltip="Cursief"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        tooltip="Onderstreept"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        tooltip="Doorgehaald"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        tooltip="Inline code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", editor.isActive("textStyle") && "bg-accent")}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Tekstkleur</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1">
            {TEXT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.name}
                className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: color.value }}
                onClick={() => editor.chain().focus().setColor(color.value).run()}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            <X className="h-3 w-3" /> Geen kleur
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", editor.isActive("highlight") && "bg-accent")}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Achtergrondkleur</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.name}
                className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: color.value }}
                onClick={() => editor.chain().focus().toggleHighlight({ color: color.value }).run()}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            <X className="h-3 w-3" /> Geen achtergrond
          </button>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        tooltip="Ongenummerde lijst"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        tooltip="Genummerde lijst"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        tooltip="Citaat"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        tooltip="Code blok"
      >
        <FileCode className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        tooltip="Horizontale lijn"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => {
          const url = window.prompt("Link URL:");
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        isActive={editor.isActive("link")}
        tooltip="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onImageUpload} tooltip="Afbeelding invoegen">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onVideoEmbed} tooltip="Video invoegen">
        <Video className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
