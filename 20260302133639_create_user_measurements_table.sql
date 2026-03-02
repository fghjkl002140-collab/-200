/*
  # Create user measurements table

  1. New Tables
    - `user_measurements`
      - `id` (uuid, primary key) - Unique identifier for each measurement record
      - `user_id` (uuid) - Reference to the user (auth.uid())
      - `weight` (numeric) - User's weight in kg
      - `height` (numeric) - User's height in cm
      - `created_at` (timestamptz) - Timestamp when the measurement was recorded
      
  2. Security
    - Enable RLS on `user_measurements` table
    - Add policy for authenticated users to read their own measurements
    - Add policy for authenticated users to insert their own measurements
*/

CREATE TABLE IF NOT EXISTS user_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  weight numeric NOT NULL,
  height numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own measurements"
  ON user_measurements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own measurements"
  ON user_measurements
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_measurements_user_id ON user_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_measurements_created_at ON user_measurements(created_at DESC);