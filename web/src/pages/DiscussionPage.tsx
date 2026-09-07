import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  fetchComments,
  fetchPaper,
  likeComment,
  paperUrl,
  postComment,
  postReply,
  type Paper,
  type PaperComment,
} from "../api";

const LIKES_KEY = "wepaper-liked-comments";

function loadLiked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(LIKES_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function storeLiked(ids: Set<string>) {
  window.localStorage.setItem(LIKES_KEY, JSON.stringify([...ids]));
}

function stamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countThread(comments: PaperComment[]): number {
  return comments.reduce((sum, item) => sum + 1 + (item.replies?.length || 0), 0);
}

export function DiscussionPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const fromSearch = (location.state as { fromSearch?: string } | null)?.fromSearch;
  const libraryTo = fromSearch ? `/?${fromSearch}` : "/";
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [comments, setComments] = useState<PaperComment[]>([]);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyLabel, setReplyLabel] = useState("匿名");
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setLiked(loadLiked());
  }, []);

  useEffect(() => {
    setError("");
    fetchPaper(id)
      .then(async (nextPaper) => {
        setPaper(nextPaper);
        setComments(await fetchComments(id));
      })
      .catch((err: Error) => setError(err.message === "Paper not found" ? "This paper is not available." : err.message));
  }, [id]);

  useEffect(() => {
    document.title = paper ? `${paper.title} · 讨论` : "wePaper";
    return () => {
      document.title = "wePaper";
    };
  }, [paper]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      if (replyTo) {
        const created = await postReply(replyTo, text, name);
        setComments((current) =>
          current.map((item) =>
            item.id === replyTo ? { ...item, replies: [...(item.replies || []), { ...created, replies: [] }] } : item,
          ),
        );
      } else {
        const created = await postComment(id, text, name);
        setComments((current) => [...current, { ...created, replies: [] }]);
      }
      setBody("");
      setReplyTo(null);
      setReplyLabel("匿名");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  async function onLike(commentId: string) {
    if (liked.has(commentId)) return;
    try {
      const result = await likeComment(commentId);
      const next = new Set(liked);
      next.add(commentId);
      setLiked(next);
      storeLiked(next);
      setComments((current) =>
        current.map((item) => {
          if (item.id === commentId) return { ...item, like_count: result.like_count };
          return {
            ...item,
            replies: (item.replies || []).map((reply) =>
              reply.id === commentId ? { ...reply, like_count: result.like_count } : reply,
            ),
          };
        }),
      );
    } catch {
      setError("Could not like comment");
    }
  }

  const total = countThread(comments);

  return (
    <div className="discuss">
      <header className="lib-bar">
        <Link className="mark" to={libraryTo}>
          ← Library
        </Link>
        <span className="discuss-count">评论 · {total}</span>
      </header>
      {error ? (
        <p className="note" role="alert">
          {error}
        </p>
      ) : null}
      {paper ? (
        <h1 className="discuss-title">
          <a href={paperUrl(paper.zotero_item_key)}>{paper.title}</a>
        </h1>
      ) : (
        <p className="note">Opening…</p>
      )}
      <form className="composer" onSubmit={onSubmit}>
        {replyTo ? (
          <p className="composer-replying">
            回复 {replyLabel}{" "}
            <button
              type="button"
              onClick={() => {
                setReplyTo(null);
                setReplyLabel("匿名");
              }}
            >
              取消
            </button>
          </p>
        ) : null}
        <label className="composer-name">
          <span className="sr-only">署名（可选）</span>
          <input
            type="text"
            maxLength={40}
            placeholder="署名（可选）"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <textarea
          ref={composerRef}
          required
          maxLength={2000}
          rows={4}
          placeholder={replyTo ? "写下回复…" : "写下对这篇论文的讨论…"}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="composer-actions">
          <button type="submit" disabled={busy || !body.trim()}>
            {replyTo ? "发送回复" : "发布"}
          </button>
        </div>
      </form>
      {paper && comments.length === 0 ? <p className="note">还没有评论。写下第一句讨论。</p> : null}
      <ol className="thread">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            liked={liked}
            onLike={onLike}
            replyTo={replyTo}
            onReply={(next, label) => {
              setReplyTo(next);
              setReplyLabel(label);
              window.requestAnimationFrame(() => {
                composerRef.current?.focus();
                composerRef.current?.scrollIntoView({ block: "center" });
              });
            }}
          />
        ))}
      </ol>
    </div>
  );
}

function CommentItem({
  comment,
  liked,
  replyTo,
  onLike,
  onReply,
}: {
  comment: PaperComment;
  liked: Set<string>;
  replyTo: string | null;
  onLike: (id: string) => void;
  onReply: (id: string, label: string) => void;
}) {
  const label = comment.display_name || "匿名";
  return (
    <li className={`comment${replyTo === comment.id ? " is-reply-target" : ""}`}>
      <header className="comment-meta">
        <span>{label}</span>
        <time dateTime={comment.created_at}>{stamp(comment.created_at)}</time>
      </header>
      <p className="comment-body">{comment.body}</p>
      <div className="comment-actions">
        <button type="button" className="text-action" disabled={liked.has(comment.id)} onClick={() => onLike(comment.id)}>
          {liked.has(comment.id) ? "已赞" : "赞"} · {comment.like_count}
        </button>
        <button type="button" className="text-action" onClick={() => onReply(comment.id, label)}>
          回复
        </button>
      </div>
      {comment.replies?.length ? (
        <ol className="replies">
          {comment.replies.map((reply) => (
            <li key={reply.id} className="comment reply">
              <header className="comment-meta">
                <span>{reply.display_name || "匿名"}</span>
                <time dateTime={reply.created_at}>{stamp(reply.created_at)}</time>
              </header>
              <p className="comment-body">{reply.body}</p>
              <div className="comment-actions">
                <button
                  type="button"
                  className="text-action"
                  disabled={liked.has(reply.id)}
                  onClick={() => onLike(reply.id)}
                >
                  {liked.has(reply.id) ? "已赞" : "赞"} · {reply.like_count}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
