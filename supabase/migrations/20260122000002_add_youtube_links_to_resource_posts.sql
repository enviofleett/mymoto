-- Add YouTube links support to resource_posts
ALTER TABLE public.resource_posts
ADD COLUMN IF NOT EXISTS youtube_links TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_resource_posts_youtube_links ON public.resource_posts USING GIN (youtube_links);
