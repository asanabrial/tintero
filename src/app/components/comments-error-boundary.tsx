"use client";

import { Component, type ReactNode } from "react";
import { t } from "@/lib/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  locale?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary wrapping the CommentsSection Suspense island.
 * If the DB is unreachable, catches the error and shows a fallback.
 * Satisfies: REQ-PPR-06, REQ-PPR-07, REQ-FAIL-01, S-20.
 */
export class CommentsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <section
            aria-label={t(this.props.locale ?? "en", "common.comments")}
            className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
          >
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t(this.props.locale ?? "en", "common.commentsUnavailable")}
            </p>
          </section>
        )
      );
    }
    return this.props.children;
  }
}
