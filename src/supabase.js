import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://emycrfyusnbxbpldorkp.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVteWNyZnl1c25ieGJwbGRvcmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzAyODEsImV4cCI6MjA5NTcwNjI4MX0.wv3gDEkFTEjJ2CSe591IhDDkrAIvGkLYqBstrquduvk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
