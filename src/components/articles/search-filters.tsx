"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getAllTags } from "@/actions/tags";
import type { Tag } from "@/types";

interface SearchFiltersProps {
  initialQuery?: string;
  initialAllStatuses?: boolean;
  initialTags?: string[];
  autoFocus?: boolean;
  onFilterChange: (filters: {
    query: string;
    allStatuses: boolean;
    tags: string[];
  }) => void;
}

export function SearchFilters({
  initialQuery = "",
  initialAllStatuses = true,
  initialTags = [],
  autoFocus = false,
  onFilterChange,
}: SearchFiltersProps) {
  const [query, setQuery] = useState(initialQuery);
  const [allStatuses, setAllStatuses] = useState(initialAllStatuses);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [tags, setTags] = useState<Tag[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    getAllTags().then(setTags);
  }, []);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  function emitChange(q: string, statuses: boolean, tagSlugs: string[]) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ query: q, allStatuses: statuses, tags: tagSlugs });
    }, 300);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    emitChange(value, allStatuses, selectedTags);
  }

  function handleStatusChange(checked: boolean) {
    setAllStatuses(checked);
    // Emit immediately for checkbox changes
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilterChange({ query, allStatuses: checked, tags: selectedTags });
  }

  function toggleTag(slug: string) {
    const next = selectedTags.includes(slug)
      ? selectedTags.filter((s) => s !== slug)
      : [...selectedTags, slug];
    setSelectedTags(next);
    // Emit immediately for tag changes
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilterChange({ query, allStatuses, tags: next });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Zoek in artikelen..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="search-include-all"
            checked={allStatuses}
            onCheckedChange={(checked) => handleStatusChange(checked === true)}
          />
          <Label htmlFor="search-include-all" className="text-sm cursor-pointer">
            Ook concepten en ter beoordeling
          </Label>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Tags:</span>
            {tags.map((tag) => {
              const isSelected = selectedTags.includes(tag.slug);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.slug)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {tag.name}
                  {isSelected && <X className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
