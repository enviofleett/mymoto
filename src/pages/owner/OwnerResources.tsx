import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useResourceCategories,
  useResourcePosts,
  useResourcePost,
  type ResourcePost,
} from "@/hooks/useResources";
import {
  BookOpen,
  ChevronLeft,
  Filter,
  Image as ImageIcon,
  Loader2,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function OwnerResources() {
  const navigate = useNavigate();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<ResourcePost | null>(null);

  const { data: categories, isLoading: categoriesLoading } = useResourceCategories();
  const { data: posts, isLoading: postsLoading } = useResourcePosts(selectedCategoryId);
  // Only fetch post detail when dialog is open
  const { data: postDetail } = useResourcePost(selectedPost?.id || null);

  // Memoize selected category lookup
  const selectedCategory = useMemo(
    () => categories?.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/owner/profile")}
                className="p-2"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-foreground">Resources</h1>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Category Filter */}
          <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Filter className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <Select
                    value={selectedCategoryId || "all"}
                    onValueChange={(v) => setSelectedCategoryId(v === "all" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categoriesLoading ? (
                        <SelectItem value="loading" disabled>Loading...</SelectItem>
                      ) : (
                        categories?.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedCategory && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <p className="text-sm text-muted-foreground">
                    {selectedCategory.description || `Posts in ${selectedCategory.name}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Posts List */}
          {postsLoading && !posts ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-0 bg-card shadow-neumorphic rounded-xl">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="border-0 bg-card shadow-neumorphic rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-neumorphic-sm active:shadow-neumorphic-inset"
                  onClick={() => setSelectedPost(post)}
                >
                  <CardContent className="p-0">
                    {post.featured_image_url && (
                      <div className="w-full h-48 overflow-hidden">
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-semibold text-foreground flex-1">{post.title}</h3>
                        {post.category && (
                          <Badge variant="secondary" className="shrink-0">
                            {post.category.name}
                          </Badge>
                        )}
                      </div>
                      <div
                        className="text-sm text-muted-foreground line-clamp-3"
                        dangerouslySetInnerHTML={{
                          __html: post.content.substring(0, 200) + (post.content.length > 200 ? "..." : ""),
                        }}
                      />
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {post.images && post.images.length > 0 && (
                          <div className="flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            <span>{post.images.length} image{post.images.length !== 1 ? "s" : ""}</span>
                          </div>
                        )}
                        {post.youtube_links && post.youtube_links.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Youtube className="h-3 w-3 text-red-500" />
                            <span>{post.youtube_links.length} video{post.youtube_links.length !== 1 ? "s" : ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardContent className="p-8 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No posts found</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedCategoryId
                    ? "No posts in this category yet."
                    : "No resource posts available yet."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Post Detail Dialog */}
        <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedPost && (() => {
              // Use postDetail if available (more complete), otherwise fallback to selectedPost
              const displayPost = postDetail || selectedPost;
              
              return (
                <>
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <DialogTitle className="text-xl">{displayPost.title}</DialogTitle>
                        {displayPost.category && (
                          <DialogDescription className="mt-1">
                            <Badge variant="secondary">{displayPost.category.name}</Badge>
                          </DialogDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPost(null)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4">
                    {displayPost.featured_image_url && (
                      <img
                        src={displayPost.featured_image_url}
                        alt={displayPost.title}
                        className="w-full rounded-lg"
                        loading="eager"
                        decoding="async"
                      />
                    )}
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: displayPost.content }}
                    />
                    {displayPost.images && displayPost.images.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-foreground">Additional Images</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {displayPost.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`${displayPost.title} - Image ${idx + 1}`}
                              className="w-full rounded-lg"
                              loading="lazy"
                              decoding="async"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {displayPost.youtube_links && displayPost.youtube_links.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-foreground flex items-center gap-2">
                          <Youtube className="h-5 w-5 text-red-500" />
                          Videos
                        </h4>
                        <div className="space-y-3">
                          {displayPost.youtube_links.map((link, idx) => {
                            // Extract video ID from various YouTube URL formats
                            const getVideoId = (url: string) => {
                              const patterns = [
                                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
                              ];
                              for (const pattern of patterns) {
                                const match = url.match(pattern);
                                if (match) return match[1];
                              }
                              return null;
                            };

                            const videoId = getVideoId(link);
                            if (!videoId) {
                              return (
                                <div key={idx} className="p-3 rounded-lg border bg-muted/50">
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:underline flex items-center gap-2"
                                  >
                                    <Youtube className="h-4 w-4 text-red-500" />
                                    {link}
                                  </a>
                                </div>
                              );
                            }

                            return (
                              <div key={idx} className="w-full">
                                <iframe
                                  width="100%"
                                  height="315"
                                  src={`https://www.youtube.com/embed/${videoId}`}
                                  title={`YouTube video ${idx + 1}`}
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="rounded-lg"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </OwnerLayout>
  );
}
