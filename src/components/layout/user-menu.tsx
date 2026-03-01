"use client";

import { LogOut, User, Settings } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

interface UserMenuProps {
  user: Profile;
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">
            {getInitials(user.display_name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium md:inline-block">
          {user.display_name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user.display_name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profiel" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            Profiel
          </Link>
        </DropdownMenuItem>
        {user.is_admin && (
          <DropdownMenuItem asChild>
            <Link href="/beheer" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Beheer
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Uitloggen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
