-- Migration: Create school_holidays table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS school_holidays (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  "startDate" DATE        NOT NULL,
  "endDate"   DATE        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
