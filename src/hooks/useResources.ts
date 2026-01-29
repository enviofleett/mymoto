import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ResourceCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResourcePost {
  id: string;
  category_id: string | null;
  title: string;
  content: string; // HTML content
  featured_image_url: string | null;
  images: string[]; // Array of image URLs
  youtube_links: string[]; // Array of YouTube video URLs
  is_published: boolean;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: ResourceCategory;
}

// Fetch all categories
export function useResourceCategories() {
  return useQuery({
    queryKey: ["resource-categories"],
    queryFn: async (): Promise<ResourceCategory[]> => {
      const { data, error } = await (supabase as any)
        .from("resource_categories")
        .select("*")
        .order("display_order", { ascending: true });

      // Gracefully handle missing table (404) - return empty array
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('does not exist')) {
          console.warn('[useResources] resource_categories table does not exist yet. Run migrations to create it.');
          return [];
        }
        throw error;
      }
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - categories change rarely
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    placeholderData: (previousData) => previousData, // Show cached data instantly
  });
}

// Fetch published posts (for users)
export function useResourcePosts(categoryId?: string | null) {
  return useQuery({
    queryKey: ["resource-posts", categoryId],
    queryFn: async (): Promise<ResourcePost[]> => {
      let query = (supabase as any)
        .from("resource_posts")
        .select(`
          id,
          category_id,
          title,
          content,
          featured_image_url,
          images,
          youtube_links,
          is_published,
          display_order,
          created_at,
          updated_at,
          category:resource_categories(id, name, description, icon)
        `)
        .eq("is_published", true)
        .order("display_order", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100); // Limit to prevent loading too many posts at once

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;

      // Gracefully handle missing table (404) - return empty array
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('does not exist')) {
          console.warn('[useResources] resource_posts table does not exist yet. Run migrations to create it.');
          return [];
        }
        throw error;
      }
      return (data || []).map((post: any) => ({
        ...post,
        images: Array.isArray(post.images) ? post.images : [],
        youtube_links: Array.isArray(post.youtube_links) ? post.youtube_links : [],
        category: post.category || null,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - posts don't change frequently
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    placeholderData: (previousData) => previousData, // Show cached data instantly
  });
}

// Fetch all posts (for admin - includes unpublished)
export function useAllResourcePosts() {
  return useQuery({
    queryKey: ["resource-posts-all"],
    queryFn: async (): Promise<ResourcePost[]> => {
      const { data, error } = await (supabase as any)
        .from("resource_posts")
        .select(`
          *,
          category:resource_categories(*)
        `)
        .order("display_order", { ascending: false })
        .order("created_at", { ascending: false });

      // Gracefully handle missing table (404) - return empty array
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('does not exist')) {
          console.warn('[useResources] resource_posts table does not exist yet. Run migrations to create it.');
          return [];
        }
        throw error;
      }
      return (data || []).map((post: any) => ({
        ...post,
        images: Array.isArray(post.images) ? post.images : [],
        youtube_links: Array.isArray(post.youtube_links) ? post.youtube_links : [],
        category: post.category || null,
      }));
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// Fetch single post
export function useResourcePost(postId: string | null) {
  return useQuery({
    queryKey: ["resource-post", postId],
    queryFn: async (): Promise<ResourcePost | null> => {
      if (!postId) return null;

      const { data, error } = await (supabase as any)
        .from("resource_posts")
        .select(`
          *,
          category:resource_categories(*)
        `)
        .eq("id", postId)
        .maybeSingle();

      // Gracefully handle missing table (404) - return null
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('does not exist')) {
          console.warn('[useResources] resource_posts table does not exist yet. Run migrations to create it.');
          return null;
        }
        throw error;
      }
      if (!data) return null;

      return {
        ...data,
        images: Array.isArray(data.images) ? data.images : [],
        youtube_links: Array.isArray(data.youtube_links) ? data.youtube_links : [],
        category: data.category || null,
      };
    },
    enabled: !!postId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnMount: false,
    placeholderData: (previousData) => previousData, // Show cached data instantly
  });
}

// Create category mutation
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string; icon?: string; display_order?: number }) => {
      const { data: result, error } = await (supabase as any)
        .from("resource_categories")
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource categories table does not exist. Please run database migrations first.');
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-categories"] });
      toast.success("Category created successfully");
    },
    onError: (error: Error) => {
      console.error("Create Category Error:", error);
      toast.error("Failed to create category", { description: error.message || "An unknown error occurred" });
    },
  });
}

// Update category mutation
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ResourceCategory>) => {
      const { data: result, error } = await (supabase as any)
        .from("resource_categories")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource categories table does not exist. Please run database migrations first.');
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-categories"] });
      toast.success("Category updated successfully");
    },
    onError: (error: Error) => {
      console.error("Update Category Error:", error);
      toast.error("Failed to update category", { description: error.message || "An unknown error occurred" });
    },
  });
}

// Delete category mutation
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("resource_categories")
        .delete()
        .eq("id", id);

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource categories table does not exist. Please run database migrations first.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-categories"] });
      queryClient.invalidateQueries({ queryKey: ["resource-posts"] });
      toast.success("Category deleted successfully");
    },
    onError: (error: Error) => {
      console.error("Delete Category Error:", error);
      toast.error("Failed to delete category", { description: error.message || "An unknown error occurred" });
    },
  });
}

// Create post mutation
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      category_id?: string | null;
      title: string;
      content: string;
      featured_image_url?: string | null;
      images?: string[];
      is_published?: boolean;
      display_order?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: result, error } = await (supabase as any)
        .from("resource_posts")
        .insert({
          ...data,
          images: data.images || [],
          youtube_links: (data as any).youtube_links || [],
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource posts table does not exist. Please run database migrations first.');
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-posts"] });
      queryClient.invalidateQueries({ queryKey: ["resource-posts-all"] });
      toast.success("Post created successfully");
    },
    onError: (error: Error) => {
      console.error("Create Post Error:", error);
      toast.error("Failed to create post", { description: error.message || "An unknown error occurred" });
    },
  });
}

// Update post mutation
export function useUpdatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ResourcePost>) => {
      const { data: result, error } = await (supabase as any)
        .from("resource_posts")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource posts table does not exist. Please run database migrations first.');
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-posts"] });
      queryClient.invalidateQueries({ queryKey: ["resource-posts-all"] });
      toast.success("Post updated successfully");
    },
    onError: (error: Error) => {
      console.error("Update Post Error:", error);
      toast.error("Failed to update post", { description: error.message || "An unknown error occurred" });
    },
  });
}

// Delete post mutation
export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("resource_posts")
        .delete()
        .eq("id", id);

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          throw new Error('Resource posts table does not exist. Please run database migrations first.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-posts"] });
      queryClient.invalidateQueries({ queryKey: ["resource-posts-all"] });
      toast.success("Post deleted successfully");
    },
    onError: (error: Error) => {
      console.error("Delete Post Error:", error);
      toast.error("Failed to delete post", { description: error.message || "An unknown error occurred" });
    },
  });
}
