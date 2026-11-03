import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import GitHubBadge from "./GitHubBadge";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="flex h-20 items-center justify-between border-b border-[#34354a]">
          <Link to="/" className="flex items-center gap-3 font-extrabold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#cbbdff] text-[#28213d]">
              <Download className="h-5 w-5" />
            </span>
            Crazy Downloader
          </Link>
          <nav className="flex items-center gap-7 text-sm text-[#c4c1d1]">
            <a href="/#how-it-works" className="hidden hover:text-white sm:block">
              How it works
            </a>
            <Link to="/privacy" className="hidden hover:text-white sm:block">
              Privacy
            </Link>
            <GitHubBadge />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto mt-12 w-full max-w-6xl px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#34354a] py-7 text-xs text-[#aaa7bb]">
          <span>Crazy Downloader © 2026</span>
          <div className="flex gap-6">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a
              href="https://github.com/nayandas69/crazy-downloader"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-[#aaa7bb]">
          For personal use only. Please respect YouTube's Terms of Service and copyright laws. No
          video data is stored on the server.
        </p>
      </footer>
    </div>
  );
}
