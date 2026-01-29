import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  Calendar,
  Share2,
  Clock,
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

  const handleRefresh = async () => {
    // Wait for a second to simulate refresh since hooks handle invalidation automatically
    // Ideally we would call refetch() from the hooks if they were exposed
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  return (
    <OwnerLayout>
      <PullToRefresh onRefresh={handleRefresh}>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="border-0 bg-card shadow-neumorphic rounded-xl h-full flex flex-col">
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <Skeleton className="w-full aspect-video mb-4 rounded-lg" />
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3 mt-auto" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="border-0 bg-card shadow-neumorphic rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-neumorphic-md hover:-translate-y-1 group h-full flex flex-col"
                  onClick={() => setSelectedPost(post)}
                >
                  <CardContent className="p-0 flex flex-col h-full">
                    <div className="w-full aspect-video overflow-hidden bg-muted relative">
                      {post.featured_image_url ? (
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground">
                          <ImageIcon className="h-12 w-12 opacity-20" />
                        </div>
                      )}
                      {post.category && (
                        <Badge variant="secondary" className="absolute top-3 left-3 backdrop-blur-md bg-background/80 shadow-sm border-0">
                          {post.category.name}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>

                      <h3 className="font-bold text-foreground text-lg leading-tight mb-3 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>

                      <p className="text-sm text-muted-foreground line-clamp-3 mb-4 leading-relaxed flex-1">
                        {post.content.replace(/<[^>]*>?/gm, '')}
                      </p>

                      <div className="flex items-center justify-between pt-4 border-t border-border/30 mt-auto">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {post.images && post.images.length > 0 && (
                            <div className="flex items-center gap-1.5" title={`${post.images.length} images`}>
                              <ImageIcon className="h-3.5 w-3.5" />
                              <span>{post.images.length}</span>
                            </div>
                          )}
                          {post.youtube_links && post.youtube_links.length > 0 && (
                            <div className="flex items-center gap-1.5" title={`${post.youtube_links.length} videos`}>
                              <Youtube className="h-3.5 w-3.5 text-red-500" />
                              <span>{post.youtube_links.length}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-primary flex items-center group-hover:translate-x-1 transition-transform">
                          Read more <ChevronLeft className="h-3 w-3 rotate-180 ml-1" />
                        </span>
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

        {/* Post Detail Sheet */}
        <Sheet open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl p-0 overflow-hidden flex flex-col gap-0 border-t-0 shadow-2xl">
            {selectedPost && (() => {
              // Use postDetail if available (more complete), otherwise fallback to selectedPost
              const displayPost = postDetail || selectedPost;
              const isLoadingDetail = !postDetail && !!selectedPost;
              
              return (
                <>
                  <SheetHeader className="p-5 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-md z-10 sticky top-0 text-left">
                    <div className="flex items-start gap-4 pr-10">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {displayPost.category && (
                            <Badge variant="outline" className="bg-muted/50">
                              {displayPost.category.name}
                            </Badge>
                          )}
                          {isLoadingDetail && (
                            <span className="flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse bg-primary/10 px-2 py-0.5 rounded-full">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Syncing...
                            </span>
                          )}
                        </div>
                        
                        <SheetTitle className="text-xl md:text-2xl font-bold leading-tight tracking-tight">
                          {displayPost.title}
                        </SheetTitle>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            {new Date(displayPost.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isLoadingDetail && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted overflow-hidden">
                        <div className="h-full bg-primary w-full animate-pulse" />
                      </div>
                    )}
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-8 pb-16 scroll-smooth">
                    {displayPost.featured_image_url && (
                      <div className="rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-muted aspect-video relative group">
                        <img
                          src={displayPost.featured_image_url}
                          alt={displayPost.title}
                          className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                          loading="eager"
                          decoding="async"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </div>
                    )}
                    
                    <div
                      className="prose prose-base md:prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
                      dangerouslySetInnerHTML={{ __html: displayPost.content }}
                    />

                    {/* Additional Images Gallery */}
                    {displayPost.images && displayPost.images.length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-border/30">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Gallery
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {displayPost.images.map((img, idx) => (
                            <div key={idx} className="rounded-lg overflow-hidden border border-border/50 aspect-square">
                              <img
                                src={img}
                                alt={`${displayPost.title} - Image ${idx + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Videos Section */}
                    {displayPost.youtube_links && displayPost.youtube_links.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-border/30">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <Youtube className="h-5 w-5 text-red-500" />
                          Related Videos
                        </h4>
                        <div className="space-y-4">
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
                              <div key={idx} className="w-full rounded-xl overflow-hidden shadow-sm border border-border/50 bg-black">
                                <iframe
                                  width="100%"
                                  height="220"
                                  src={`https://www.youtube.com/embed/${videoId}`}
                                  title={`YouTube video ${idx + 1}`}
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="w-full"
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
          </SheetContent>
        </Sheet>
      </div>
      </PullToRefresh>
    </OwnerLayout>
  );
}
