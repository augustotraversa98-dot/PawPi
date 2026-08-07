import { useState } from "react";
import { Store, Loader2, Send, Trash2, ImageIcon, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useProvider,
  useUpdateProviderProfile,
  useProviderPosts,
  useCreateProviderPost,
  useDeleteProviderPost,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import ImageUploader from "./ImageUploader";
import StorefrontPreview from "./StorefrontPreview";

// /provider/storefront — the provider's STOREFRONT composer (ticket 2.22). Set the
// cover banner, compose posts (text + images via Storage), and list/delete posts.
// What's published here is exactly what owners see on the public storefront
// (services/items/reviews come from their own sections). Real data only — empty
// states where there's nothing.
export default function ProviderStorefront({ providerId }) {
  // Two views of the storefront: EDIT (cover + posts composer, existing) and a read-only
  // "View as customer" preview (Phase 2b) that renders the store as a customer sees it.
  const [view, setView] = useState("edit");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Store className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#3B241B]">Storefront</h1>
          <p className="text-sm text-[#7A6254]">
            Your cover image and the posts owners see when they open your store.
          </p>
        </div>
      </div>

      {/* Edit vs. read-only customer preview. */}
      <div className="mb-6 inline-flex rounded-xl border p-1" style={{ borderColor: COLORS.peach }}>
        <ViewTab active={view === "edit"} onClick={() => setView("edit")} Icon={Pencil}>
          Edit
        </ViewTab>
        <ViewTab active={view === "preview"} onClick={() => setView("preview")} Icon={Eye}>
          View as customer
        </ViewTab>
      </div>

      {view === "preview" ? (
        <StorefrontPreview providerId={providerId} />
      ) : (
        <>
          <CoverEditor providerId={providerId} />
          <ComposePost providerId={providerId} />

          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
            Posts
          </h2>
          <PostList providerId={providerId} />
        </>
      )}
    </div>
  );
}

function ViewTab({ active, onClick, Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
      style={{
        backgroundColor: active ? COLORS.coral : "transparent",
        color: active ? "#fff" : "#7A6254",
      }}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function CoverEditor({ providerId }) {
  const { data, isLoading } = useProvider(providerId);
  const update = useUpdateProviderProfile(providerId);
  const cover = data?.provider?.cover_image_url;
  const value = cover ? [cover] : [];

  const onChange = async (next) => {
    try {
      await update.mutateAsync({ cover_image_url: next[0] ?? null });
      toast.success(next[0] ? "Cover updated" : "Cover removed");
    } catch (err) {
      toast.error(err.message || "Couldn't update the cover");
    }
  };

  return (
    <div
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-[#7A6254]">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: COLORS.coral }} />
          Loading…
        </div>
      ) : (
        <ImageUploader label="Cover image" value={value} onChange={onChange} max={1} />
      )}
    </div>
  );
}

function ComposePost({ providerId }) {
  const create = useCreateProviderPost(providerId);
  const [body, setBody] = useState("");
  const [images, setImages] = useState([]);

  const submit = async (e) => {
    e.preventDefault();
    if (body.trim().length === 0 && images.length === 0) {
      toast.error("Add some text or at least one image.");
      return;
    }
    try {
      await create.mutateAsync({ body: body.trim(), image_urls: images });
      toast.success("Posted");
      setBody("");
      setImages([]);
    } catch (err) {
      toast.error(err.message || "Couldn't post");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border p-4"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Share an announcement, a photo, or an update…"
        className="w-full resize-y rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: COLORS.peach }}
      />
      <div className="mt-3">
        <ImageUploader label="Photos" value={images} onChange={setImages} />
      </div>
      <button
        type="submit"
        disabled={create.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: COLORS.coral }}
      >
        <Send className="h-4 w-4" />
        {create.isPending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}

function PostList({ providerId }) {
  const { data: posts, isLoading, isError, error } = useProviderPosts(providerId);
  const del = useDeleteProviderPost(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading posts…
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-sm text-[#B4452F]">
        {error?.message || "Couldn't load posts."}
      </p>
    );
  }
  if (!posts || posts.length === 0) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
      >
        <Store className="mx-auto h-8 w-8" style={{ color: COLORS.terracotta }} />
        <p className="mt-3 font-semibold text-[#3B241B]">No posts yet</p>
        <p className="mt-1 text-sm text-[#7A6254]">
          Your first post will show on your storefront.
        </p>
      </div>
    );
  }

  const remove = (id) => {
    if (window.confirm("Delete this post? It will disappear from your storefront.")) {
      del.mutate(id, {
        onSuccess: () => toast.success("Post deleted"),
        onError: (err) => toast.error(err.message || "Couldn't delete"),
      });
    }
  };

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border p-4"
          style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {p.body ? (
                <p className="whitespace-pre-wrap text-sm text-[#3B241B]">{p.body}</p>
              ) : (
                <p className="inline-flex items-center gap-1 text-sm text-[#7A6254]">
                  <ImageIcon className="h-4 w-4" /> Photo post
                </p>
              )}
            </div>
            <button
              onClick={() => remove(p.id)}
              aria-label="Delete post"
              className="rounded-lg p-1.5 text-[#B4452F] hover:bg-[#FBE6E4]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {Array.isArray(p.image_urls) && p.image_urls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.image_urls.map((url, i) => (
                <img
                  key={`${p.id}-${i}`}
                  src={url}
                  alt={`Post ${p.id} image ${i + 1}`}
                  className="h-20 w-20 rounded-lg object-cover"
                  style={{ backgroundColor: COLORS.cream }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
