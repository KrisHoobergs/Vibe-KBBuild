"use client";

import { useState } from "react";
import { X, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createTag } from "@/actions/tags";
import type { Tag } from "@/types";

interface TagSelectorProps {
  allTags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagSelector({ allTags, selectedTagIds, onChange }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tags, setTags] = useState(allTags);
  const [creating, setCreating] = useState(false);

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setCreating(true);

    const formData = new FormData();
    formData.set("name", newTagName.trim());
    const result = await createTag(formData);

    if (result.success && result.data) {
      setTags([...tags, result.data]);
      onChange([...selectedTagIds, result.data.id]);
      setNewTagName("");
    }
    setCreating(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {selectedTags.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1">
            {tag.name}
            <button
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="ml-1 rounded-full hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              Tag toevoegen
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-2">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <div className="flex h-4 w-4 items-center justify-center rounded border">
                      {selectedTagIds.includes(tag.id) && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                    {tag.name}
                  </button>
                ))}
              </div>
              <div className="border-t pt-2">
                <div className="flex gap-1">
                  <Input
                    placeholder="Nieuwe tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={handleCreateTag}
                    disabled={creating || !newTagName.trim()}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
