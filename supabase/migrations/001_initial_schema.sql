-- Expenses table
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric(10,2) not null check (amount > 0),
  description text not null,
  category text not null default 'Miscellaneous',
  date date not null default current_date,
  input_method text not null default 'manual' check (input_method in ('manual', 'voice')),
  ai_categorized boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Monthly summaries table
create table if not exists public.monthly_summaries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2020),
  total_spent numeric(10,2) not null default 0,
  category_breakdown jsonb not null default '{}',
  top_expenses jsonb not null default '[]',
  tips text[] not null default '{}',
  comparison jsonb,
  created_at timestamptz default now() not null,
  unique(user_id, month, year)
);

-- Indexes
create index if not exists idx_expenses_user_date on public.expenses(user_id, date desc);
create index if not exists idx_expenses_user_category on public.expenses(user_id, category);
create index if not exists idx_monthly_summaries_user on public.monthly_summaries(user_id, year desc, month desc);

-- Enable RLS
alter table public.expenses enable row level security;
alter table public.monthly_summaries enable row level security;

-- RLS policies for expenses
create policy "Users can view their own expenses"
  on public.expenses for select
  using (auth.uid() = user_id);

create policy "Users can insert their own expenses"
  on public.expenses for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own expenses"
  on public.expenses for update
  using (auth.uid() = user_id);

create policy "Users can delete their own expenses"
  on public.expenses for delete
  using (auth.uid() = user_id);

-- RLS policies for monthly_summaries
create policy "Users can view their own summaries"
  on public.monthly_summaries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own summaries"
  on public.monthly_summaries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own summaries"
  on public.monthly_summaries for update
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.expenses
  for each row
  execute function public.handle_updated_at();
