"use client";

import { useActionState, useEffect, useState } from "react";
import type { Comment } from "@/lib/comments";
import { editCommentAction, type EditCommentActionState, replyToCommentAction, type ReplyActionState } from "../actions";
import { Button, ButtonLink } from "@/app/components/ui/button";
import { useT } from "@/lib/i18n/provider";

export function CommentsTable({
  comments,
  bulkCommentAction,
  isTrashView,
}: {
  comments: Comment[];
  bulkCommentAction: (formData: FormData) => void | Promise<void>;
  isTrashView: boolean;
}) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);

  const NON_TRASH_BULK_ACTIONS = [
    { value: "approve", label: tr("admin.comments.approve") },
    { value: "pending", label: tr("admin.comments.unapprove") },
    { value: "spam", label: tr("admin.comments.spam") },
    { value: "trash", label: tr("admin.editor.moveToTrash") },
  ];

  const TRASH_BULK_ACTIONS = [
    { value: "restore", label: tr("admin.common.restore") },
    { value: "delete-permanently", label: tr("admin.common.deletePermanently") },
  ];

  const bulkActions = isTrashView ? TRASH_BULK_ACTIONS : NON_TRASH_BULK_ACTIONS;

  const allSelected = comments.length > 0 && selected.size === comments.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(comments.map((c) => c.id)));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {/* WordPress-style tablenav: the bulk-action dropdown + Apply is always
          visible above the table (Apply disabled until rows are selected). */}
      <form
        action={bulkCommentAction}
        onSubmit={(e) => {
          if (selected.size === 0) {
            e.preventDefault();
            return;
          }
          const action = new FormData(e.currentTarget).get("action");
          if (
            action === "delete-permanently" &&
            !window.confirm(tr("admin.comments.confirmBulkDelete", { count: selected.size }))
          ) {
            e.preventDefault();
          }
        }}
        className="mb-2 flex items-center gap-2"
      >
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="id" value={id} />
        ))}
        <label className="sr-only" htmlFor="bulk-action">
          {tr("admin.common.apply")}
        </label>
        <select
          id="bulk-action"
          name="action"
          defaultValue={bulkActions[0].value}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {bulkActions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={selected.size === 0}>
          {tr("admin.common.apply")}
        </Button>
        {selected.size > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("admin.common.selected", { count: selected.size })}
          </span>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={tr("admin.comments.selectAll")}
                />
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.comments.colAuthor")}
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.comments.colComment")}
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.comments.colResponseTo")}
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.comments.colDate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {comments.map((comment) => (
              <>
                <tr
                  key={comment.id}
                  className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors align-top"
                >
                  <td className="py-2.5 px-3">
                    <input
                      type="checkbox"
                      checked={selected.has(comment.id)}
                      onChange={() => toggleOne(comment.id)}
                      aria-label={`Select comment by ${comment.authorName}`}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{comment.authorName}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{comment.authorEmail}</div>
                    {comment.authorUrl && (
                      <a
                        href={comment.authorUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-xs text-zinc-500 dark:text-zinc-400 underline break-all"
                      >
                        {comment.authorUrl}
                      </a>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300 max-w-md">{comment.body}</td>
                  <td className="py-2.5 px-3">
                    <ButtonLink
                      href={`/blog/${comment.postSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="link"
                    >
                      {comment.postSlug}
                    </ButtonLink>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    {comment.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {!isTrashView && comment.status === "approved" && comment.parentId === null && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setReplyingTo((cur) => (cur === comment.id ? null : comment.id))
                          }
                          className="text-xs text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-zinc-50"
                          aria-expanded={replyingTo === comment.id}
                        >
                          {tr("common.reply")}
                        </button>
                      </div>
                    )}
                    {!isTrashView && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingComment((cur) => (cur === comment.id ? null : comment.id))
                          }
                          className="text-xs text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-zinc-50"
                          aria-expanded={editingComment === comment.id}
                        >
                          {tr("admin.common.edit")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {replyingTo === comment.id && (
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td colSpan={5} className="px-3 pb-3">
                      <ReplyRow
                        commentId={comment.id}
                        onDone={() => setReplyingTo(null)}
                      />
                    </td>
                  </tr>
                )}
                {editingComment === comment.id && (
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td colSpan={5} className="px-3 pb-3">
                      <EditRow
                        commentId={comment.id}
                        currentBody={comment.body}
                        onDone={() => setEditingComment(null)}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReplyRow({
  commentId,
  onDone,
}: {
  commentId: string;
  onDone: () => void;
}) {
  const tr = useT();
  const [state, formAction, pending] = useActionState<ReplyActionState, FormData>(
    replyToCommentAction.bind(null, commentId),
    { status: "idle" }
  );

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-2 pt-2">
      <label className="sr-only" htmlFor={`reply-${commentId}`}>
        {tr("admin.comments.sendReply")}
      </label>
      <textarea
        id={`reply-${commentId}`}
        name="body"
        rows={3}
        required
        maxLength={5000}
        placeholder={tr("admin.comments.replyPlaceholder")}
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
      />
      {state.status === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:hover:text-zinc-50 disabled:opacity-50"
        >
          {pending ? tr("admin.comments.sending") : tr("admin.comments.sendReply")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {tr("admin.common.cancel")}
        </button>
      </div>
    </form>
  );
}

function EditRow({
  commentId,
  currentBody,
  onDone,
}: {
  commentId: string;
  currentBody: string;
  onDone: () => void;
}) {
  const tr = useT();
  const [state, formAction, pending] = useActionState<EditCommentActionState, FormData>(
    editCommentAction.bind(null, commentId),
    { status: "idle" }
  );

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-2 pt-2">
      <label className="sr-only" htmlFor={`edit-${commentId}`}>
        {tr("admin.common.edit")}
      </label>
      <textarea
        id={`edit-${commentId}`}
        name="body"
        rows={4}
        required
        minLength={10}
        maxLength={5000}
        defaultValue={currentBody}
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
      />
      {state.status === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:hover:text-zinc-50 disabled:opacity-50"
        >
          {pending ? tr("admin.common.saving") : tr("admin.common.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {tr("admin.common.cancel")}
        </button>
      </div>
    </form>
  );
}
