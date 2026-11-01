create table users (
  id uuid primary key,
  email text unique not null,
  password_hash text not null
);

create table products (
  id uuid primary key,
  name text not null,
  price numeric not null
);

create table orders (
  id serial primary key,
  user_id uuid references users(id),
  total numeric not null,
  charge_id text,
  status text default 'paid'
);
