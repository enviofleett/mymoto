import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useResourceCategories,
  useAllResourcePosts,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  type ResourceCategory,
  type ResourcePost,
} from "@/hooks/useResources";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Image as ImageIcon,
  Loader2,
  BookOpen,
  FolderPlus,
  Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminResources() {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceCategory | null>(null);
  const [editingPost, setEditingPost] = useState<ResourcePost | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: categories, isLoading: categoriesLoading } = useResourceCategories();
  const { data: posts, isLoading: postsLoading } = useAllResourcePosts();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  // Category form state
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("");
  const [categoryOrder, setCategoryOrder] = useState(0);

  // Post form state
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postCategoryId, setPostCategoryId] = useState<string | null>(null);
  const [postFeaturedImage, setPostFeaturedImage] = useState<string | null>(null);
  const [postImages, setPostImages] = useState<string[]>([]);
  const [postYoutubeLinks, setPostYoutubeLinks] = useState<string[]>([]);
  const [newYoutubeLink, setNewYoutubeLink] = useState("");
  const [postPublished, setPostPublished] = useState(true);
  const [postOrder, setPostOrder] = useState(0);

  const handleOpenCategoryDialog = (category?: ResourceCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategoryDescription(category.description || "");
      setCategoryIcon(category.icon || "");
      setCategoryOrder(category.display_order);
    } else {
      setEditingCategory(null);
      setCategoryName("");
      setCategoryDescription("");
      setCategoryIcon("");
      setCategoryOrder(0);
    }
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    const data = {
      name: categoryName.trim(),
      description: categoryDescription.trim() || null,
      icon: categoryIcon.trim() || null,
      display_order: categoryOrder,
    };

    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, ...data });
      } else {
        await createCategory.mutateAsync(data);
      }

      setCategoryDialogOpen(false);
      resetCategoryForm();
    } catch (error) {
      console.error("Failed to save category:", error);
      // Toast is already handled by the hook
    }
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDescription("");
    setCategoryIcon("");
    setCategoryOrder(0);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this category? Posts in this category will be unassigned.")) {
      return;
    }
    try {
      await deleteCategory.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete category:", error);
    }
  };

  const handleOpenPostDialog = (post?: ResourcePost) => {
    if (post) {
      setEditingPost(post);
      setPostTitle(post.title);
      setPostContent(post.content);
      setPostCategoryId(post.category_id || null);
      setPostFeaturedImage(post.featured_image_url || null);
      setPostImages(post.images || []);
      setPostYoutubeLinks(post.youtube_links || []);
      setPostPublished(post.is_published);
      setPostOrder(post.display_order);
    } else {
      setEditingPost(null);
      setPostTitle("");
      setPostContent("");
      setPostCategoryId(null);
      setPostFeaturedImage(null);
      setPostImages([]);
      setPostYoutubeLinks([]);
      setNewYoutubeLink("");
      setPostPublished(true);
      setPostOrder(0);
    }
    setPostDialogOpen(true);
  };

  const handleSavePost = async () => {
    if (!postTitle.trim()) {
      toast.error("Post title is required");
      return;
    }
    if (!postContent.trim()) {
      toast.error("Post content is required");
      return;
    }

    const data = {
      category_id: postCategoryId || null,
      title: postTitle.trim(),
      content: postContent.trim(),
      featured_image_url: postFeaturedImage || null,
      images: postImages,
      youtube_links: postYoutubeLinks,
      is_published: postPublished,
      display_order: postOrder,
    };

    try {
      if (editingPost) {
        await updatePost.mutateAsync({ id: editingPost.id, ...data });
      } else {
        await createPost.mutateAsync(data);
      }

      setPostDialogOpen(false);
      resetPostForm();
    } catch (error) {
      console.error("Failed to save post:", error);
    }
  };

  const resetPostForm = () => {
    setEditingPost(null);
    setPostTitle("");
    setPostContent("");
    setPostCategoryId(null);
    setPostFeaturedImage(null);
    setPostImages([]);
    setPostPublished(true);
    setPostOrder(0);
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) {
      return;
    }
    try {
      await deletePost.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete post:", error);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, isFeatured = false) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `resource-${Date.now()}.${fileExt}`;
      const filePath = `resources/${fileName}`;

      // Upload to storage (using avatars bucket for now, or create resources bucket)
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const imageUrl = urlData.publicUrl;

      if (isFeatured) {
        setPostFeaturedImage(imageUrl);
      } else {
        setPostImages([...postImages, imageUrl]);
      }

      toast.success("Image uploaded successfully");
    } catch (err: any) {
      console.error("Error uploading image:", err);
      toast.error("Failed to upload image", { description: err.message });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (index: number) => {
    setPostImages(postImages.filter((_, i) => i !== index));
  };

  const removeFeaturedImage = () => {
    setPostFeaturedImage(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resource Management</h1>
          <p className="text-muted-foreground">
            Manage resource posts and categories for the MyMoto app
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Categories Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderPlus className="h-5 w-5" />
                    Categories
                  </CardTitle>
                  <CardDescription>Manage post categories</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleOpenCategoryDialog()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Category
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : categories && categories.length > 0 ? (
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div>
                        <div className="font-medium">{category.name}</div>
                        {category.description && (
                          <div className="text-sm text-muted-foreground">{category.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenCategoryDialog(category)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(category.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No categories yet. Create one to get started.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Posts Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Posts
                  </CardTitle>
                  <CardDescription>Manage resource posts</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleOpenPostDialog()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Post
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {postsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : posts && posts.length > 0 ? (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">{post.title}</div>
                          {!post.is_published && (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {post.category?.name || "Uncategorized"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPostDialog(post)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePost(post.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No posts yet. Create one to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Category Dialog */}
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit Category" : "Create Category"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "Update the category details"
                  : "Create a new category for organizing posts"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="category-name">Name *</Label>
                <Input
                  id="category-name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g., Getting Started"
                />
              </div>
              <div>
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="Brief description of this category"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="category-icon">Icon (optional)</Label>
                <Input
                  id="category-icon"
                  value={categoryIcon}
                  onChange={(e) => setCategoryIcon(e.target.value)}
                  placeholder="Icon name or emoji"
                />
              </div>
              <div>
                <Label htmlFor="category-order">Display Order</Label>
                <Input
                  id="category-order"
                  type="number"
                  value={categoryOrder}
                  onChange={(e) => setCategoryOrder(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveCategory}
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                {(createCategory.isPending || updateCategory.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Post Dialog */}
        <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPost ? "Edit Post" : "Create Post"}
              </DialogTitle>
              <DialogDescription>
                {editingPost
                  ? "Update the post details"
                  : "Create a new resource post"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="post-title">Title *</Label>
                <Input
                  id="post-title"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Post title"
                />
              </div>
              <div>
                <Label htmlFor="post-category">Category</Label>
                <Select value={postCategoryId || "none"} onValueChange={(v) => setPostCategoryId(v === "none" ? null : (v || null))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="post-content">Content * (HTML supported)</Label>
                <Textarea
                  id="post-content"
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Post content (HTML supported)"
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You can use HTML tags for formatting (e.g., &lt;p&gt;, &lt;strong&gt;, &lt;img&gt;)
                </p>
              </div>
              <div>
                <Label>Featured Image</Label>
                {postFeaturedImage ? (
                  <div className="mt-2 space-y-2">
                    <img
                      src={postFeaturedImage}
                      alt="Featured"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={removeFeaturedImage}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, true)}
                      disabled={uploadingImage}
                      className="cursor-pointer"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Additional Images</Label>
                <div className="mt-2 space-y-2">
                  {postImages.map((img, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <img
                        src={img}
                        alt={`Image ${idx + 1}`}
                        className="w-32 h-32 object-cover rounded-lg"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeImage(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, false)}
                    disabled={uploadingImage}
                    className="cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <Label>YouTube Videos</Label>
                <div className="mt-2 space-y-2">
                  {postYoutubeLinks.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/50">
                      <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-600 hover:underline truncate"
                      >
                        {link}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPostYoutubeLinks(postYoutubeLinks.filter((_, i) => i !== idx))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={newYoutubeLink}
                      onChange={(e) => setNewYoutubeLink(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newYoutubeLink.trim()) {
                          e.preventDefault();
                          const url = newYoutubeLink.trim();
                          // Validate YouTube URL
                          if (
                            url.includes("youtube.com/watch") ||
                            url.includes("youtu.be/") ||
                            url.includes("youtube.com/embed/")
                          ) {
                            setPostYoutubeLinks([...postYoutubeLinks, url]);
                            setNewYoutubeLink("");
                          } else {
                            toast.error("Please enter a valid YouTube URL");
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (newYoutubeLink.trim()) {
                          const url = newYoutubeLink.trim();
                          // Validate YouTube URL
                          if (
                            url.includes("youtube.com/watch") ||
                            url.includes("youtu.be/") ||
                            url.includes("youtube.com/embed/")
                          ) {
                            setPostYoutubeLinks([...postYoutubeLinks, url]);
                            setNewYoutubeLink("");
                          } else {
                            toast.error("Please enter a valid YouTube URL");
                          }
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter YouTube video URLs (e.g., https://www.youtube.com/watch?v=...)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={postPublished}
                    onCheckedChange={setPostPublished}
                  />
                  <Label>Published</Label>
                </div>
                <div>
                  <Label htmlFor="post-order">Display Order</Label>
                  <Input
                    id="post-order"
                    type="number"
                    value={postOrder}
                    onChange={(e) => setPostOrder(parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPostDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSavePost}
                disabled={createPost.isPending || updatePost.isPending || uploadingImage}
              >
                {(createPost.isPending || updatePost.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
