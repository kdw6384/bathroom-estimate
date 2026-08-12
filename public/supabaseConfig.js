// anon(public) 키는 브라우저에 노출되는 게 정상입니다 — 실제 접근 제어는
// Supabase의 Row Level Security(RLS) 정책이 담당합니다.
const SUPABASE_URL = "https://upbrdzxqydbmyoczxsxq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYnJkenhxeWRibXlvY3p4c3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MTYzOTksImV4cCI6MjEwMjA5MjM5OX0.aO_hP1SPd8-tDliM7zO2wmYt-pqqWrjRtJFuKRonhns";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
