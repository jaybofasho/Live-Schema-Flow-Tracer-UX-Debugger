-- server/supabase/migrations/20261001000000_flowtracer_cloud_workspace.sql
-- Flow Tracer Phase 2: Hybrid Cloud Workspace & Team Sharing
-- Manages shared sessions, team workspaces, Cloudflare R2 storage assets, and in-browser annotations.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations & Teams (Corporate Subscriptions)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'team_monthly', -- 'team_monthly', 'team_annual', 'enterprise'
    polar_subscription_id TEXT UNIQUE,
    seat_limit INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- 3. Shared Tracing Sessions
CREATE TABLE IF NOT EXISTS public.shared_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_slug TEXT UNIQUE NOT NULL, -- e.g. "fl_9a8b7c" for https://flowtracer.dev/share/:slug
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Untitled UX Flow',
    app_url TEXT,
    device_preset TEXT,
    viewport_width INT NOT NULL DEFAULT 1920,
    viewport_height INT NOT NULL DEFAULT 1080,
    total_steps INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    
    -- Cloudflare R2 Asset Pointers (Zero egress cost storage)
    video_r2_url TEXT,
    storyboard_r2_url TEXT,
    html_player_r2_url TEXT,
    
    -- Structured Graph & Timeline Payloads (Serializable from FlowGraphModel.toJSON())
    graph_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    timeline JSONB NOT NULL DEFAULT '[]'::JSONB,
    transcripts JSONB DEFAULT '[]'::JSONB,
    
    -- Access control: 'public_unlisted', 'org_only', 'password_protected'
    visibility TEXT NOT NULL DEFAULT 'public_unlisted',
    password_hash TEXT,
    view_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Session Comments (Web-based review by QA & Product Managers)
CREATE TABLE IF NOT EXISTS public.session_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.shared_sessions(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shared_sessions_slug ON public.shared_sessions(share_slug);
CREATE INDEX IF NOT EXISTS idx_shared_sessions_org ON public.shared_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_session_comments_session ON public.session_comments(session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_comments ENABLE ROW LEVEL SECURITY;

-- POLICIES: Shared Sessions
-- Anyone can view public unlisted sessions via the unique slug
CREATE POLICY "Public read unlisted sessions" 
ON public.shared_sessions FOR SELECT 
USING (visibility = 'public_unlisted');

-- Authenticated organization members can view their private team sessions
CREATE POLICY "Org members can view private sessions" 
ON public.shared_sessions FOR SELECT 
TO authenticated 
USING (
  visibility = 'org_only' AND org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- Authenticated users can insert new shared sessions
CREATE POLICY "Users can create shared sessions" 
ON public.shared_sessions FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- POLICIES: Comments
-- Anyone who can read the session can read comments
CREATE POLICY "Read session comments"
ON public.session_comments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.shared_sessions 
  WHERE public.shared_sessions.id = session_id
));

-- Anyone who can view can post comments
CREATE POLICY "Insert session comments"
ON public.session_comments FOR INSERT
WITH CHECK (true);
