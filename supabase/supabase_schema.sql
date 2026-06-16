-- Social Pet / PawPi — real schema from Anything (Neon) dump, cleaned for Supabase
-- Structure only, no data, no Neon role/ownership statements. Safe to run in Supabase SQL Editor.

-- Schema
--
-- PostgreSQL database dump
--

-- Dumped from database version 17.10 (6a49db4)
-- Dumped by pg_dump version 17.10 (6a49db4)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_accounts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.auth_accounts (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    type character varying(255) NOT NULL,
    provider character varying(255) NOT NULL,
    "providerAccountId" character varying(255) NOT NULL,
    refresh_token text,
    access_token text,
    expires_at bigint,
    id_token text,
    scope text,
    session_state text,
    token_type text,
    password text
);

--
-- Name: auth_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.auth_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: auth_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.auth_accounts_id_seq OWNED BY public.auth_accounts.id;

--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.auth_sessions (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    expires timestamp with time zone NOT NULL,
    "sessionToken" character varying(255) NOT NULL
);

--
-- Name: auth_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.auth_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: auth_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.auth_sessions_id_seq OWNED BY public.auth_sessions.id;

--
-- Name: auth_users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.auth_users (
    id integer NOT NULL,
    name character varying(255),
    email character varying(255),
    "emailVerified" timestamp with time zone,
    image text
);

--
-- Name: auth_users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.auth_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: auth_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.auth_users_id_seq OWNED BY public.auth_users.id;

--
-- Name: auth_verification_token; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.auth_verification_token (
    identifier text NOT NULL,
    expires timestamp with time zone NOT NULL,
    token text NOT NULL
);

--
-- Name: health_food_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_food_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    meal_type text,
    food_name text,
    amount text,
    appetite text,
    finished_meal boolean,
    water_intake text,
    vomiting_or_reaction boolean,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_food_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_food_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_food_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_food_logs_id_seq OWNED BY public.health_food_logs.id;

--
-- Name: health_general_checks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_general_checks (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    eyes_status text,
    ears_status text,
    teeth_status text,
    skin_fur_status text,
    paws_status text,
    face_status text,
    mood text,
    energy text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_general_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_general_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_general_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_general_checks_id_seq OWNED BY public.health_general_checks.id;

--
-- Name: health_medical_care_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_medical_care_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    routine_id integer,
    medical_care_item_id text,
    care_type text,
    name text,
    dose text,
    given_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    notes text,
    reaction_or_issue jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_medical_care_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_medical_care_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_medical_care_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_medical_care_logs_id_seq OWNED BY public.health_medical_care_logs.id;

--
-- Name: health_mobility_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_mobility_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    limping boolean DEFAULT false,
    stiffness boolean DEFAULT false,
    difficulty_standing boolean DEFAULT false,
    difficulty_stairs_or_jumping boolean DEFAULT false,
    pain_signs boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_mobility_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_mobility_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_mobility_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_mobility_logs_id_seq OWNED BY public.health_mobility_logs.id;

--
-- Name: health_pee_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_pee_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    frequency text,
    volume text,
    color text,
    accident_in_house boolean DEFAULT false,
    difficulty_peeing boolean DEFAULT false,
    pain_or_crying boolean DEFAULT false,
    blood_visible boolean DEFAULT false,
    increased_thirst boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_pee_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_pee_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_pee_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_pee_logs_id_seq OWNED BY public.health_pee_logs.id;

--
-- Name: health_photo_checks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_photo_checks (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    body_area text NOT NULL,
    image_url text NOT NULL,
    notes text,
    included_in_vet_summary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT health_photo_checks_body_area_check CHECK ((body_area = ANY (ARRAY['paws'::text, 'ears'::text, 'eyes'::text, 'teeth'::text, 'skin_fur'::text, 'face'::text, 'full_body'::text, 'other'::text])))
);

--
-- Name: health_photo_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_photo_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_photo_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_photo_checks_id_seq OWNED BY public.health_photo_checks.id;

--
-- Name: health_poo_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_poo_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    amount text,
    shape text,
    color text,
    blood boolean DEFAULT false,
    mucus boolean DEFAULT false,
    straining boolean DEFAULT false,
    accident_in_house boolean DEFAULT false,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_poo_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_poo_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_poo_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_poo_logs_id_seq OWNED BY public.health_poo_logs.id;

--
-- Name: health_timeline_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_timeline_events (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    event_type text NOT NULL,
    related_record_id integer NOT NULL,
    title text NOT NULL,
    summary text,
    event_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT health_timeline_events_event_type_check CHECK ((event_type = ANY (ARRAY['food'::text, 'poo'::text, 'pee'::text, 'vomit'::text, 'walk'::text, 'mobility'::text, 'general_check'::text, 'photo_check'::text, 'weight'::text])))
);

--
-- Name: health_timeline_events_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_timeline_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_timeline_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_timeline_events_id_seq OWNED BY public.health_timeline_events.id;

--
-- Name: health_vomit_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_vomit_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    number_of_episodes integer DEFAULT 1,
    appearance text,
    relation_to_food text,
    appetite_after text,
    energy text,
    diarrhea_present boolean DEFAULT false,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_vomit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_vomit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_vomit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_vomit_logs_id_seq OWNED BY public.health_vomit_logs.id;

--
-- Name: health_walk_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_walk_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes integer,
    distance numeric(10,2),
    distance_unit text DEFAULT 'miles'::text,
    pace text,
    energy_after text,
    potty_events jsonb,
    route_or_location text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    average_speed numeric(5,2),
    steps integer,
    source text DEFAULT 'manual'::text,
    source_device text
);

--
-- Name: health_walk_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_walk_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_walk_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_walk_logs_id_seq OWNED BY public.health_walk_logs.id;

--
-- Name: health_weight_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_weight_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    weight numeric(5,2) NOT NULL,
    weight_unit text DEFAULT 'lbs'::text,
    body_shape_estimate text,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: health_weight_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_weight_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_weight_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_weight_logs_id_seq OWNED BY public.health_weight_logs.id;

--
-- Name: health_wellness_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.health_wellness_logs (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    routine_id integer,
    wellness_check_item_index integer,
    check_type text NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    values_json jsonb,
    notes text,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT health_wellness_logs_check_type_check CHECK ((check_type = ANY (ARRAY['general'::text, 'body_condition'::text, 'mobility'::text, 'mood_energy'::text, 'skin_coat'::text, 'appetite_hydration'::text, 'custom'::text])))
);

--
-- Name: health_wellness_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.health_wellness_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: health_wellness_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.health_wellness_logs_id_seq OWNED BY public.health_wellness_logs.id;

--
-- Name: pet_allergies; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_allergies (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    allergen text NOT NULL,
    severity text,
    reaction text,
    diagnosed_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pet_allergies_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_allergies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_allergies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_allergies_id_seq OWNED BY public.pet_allergies.id;

--
-- Name: pet_conditions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_conditions (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    condition text NOT NULL,
    status text DEFAULT 'active'::text,
    diagnosed_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pet_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_conditions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_conditions_id_seq OWNED BY public.pet_conditions.id;

--
-- Name: pet_friendships; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_friendships (
    id integer NOT NULL,
    requester_user_id integer NOT NULL,
    receiver_user_id integer NOT NULL,
    requester_pet_id integer NOT NULL,
    receiver_pet_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pet_friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])))
);

--
-- Name: pet_friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_friendships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_friendships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_friendships_id_seq OWNED BY public.pet_friendships.id;

--
-- Name: pet_lab_results; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_lab_results (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    test_name text NOT NULL,
    test_date date NOT NULL,
    results text,
    ordered_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pet_lab_results_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_lab_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_lab_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_lab_results_id_seq OWNED BY public.pet_lab_results.id;

--
-- Name: pet_medical_profiles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_medical_profiles (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    microchip_id text,
    spayed_neutered_status text,
    spayed_neutered_date date,
    primary_vet_name text,
    primary_clinic_name text,
    vet_phone text,
    vet_email text,
    emergency_contact_name text,
    emergency_contact_phone text,
    insurance_provider text,
    insurance_policy_number text,
    medical_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

--
-- Name: pet_medical_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_medical_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_medical_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_medical_profiles_id_seq OWNED BY public.pet_medical_profiles.id;

--
-- Name: pet_surgeries; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pet_surgeries (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    procedure text NOT NULL,
    surgery_date date NOT NULL,
    surgeon text,
    clinic text,
    complications text,
    recovery text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pet_surgeries_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pet_surgeries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pet_surgeries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pet_surgeries_id_seq OWNED BY public.pet_surgeries.id;

--
-- Name: pets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pets (
    id integer NOT NULL,
    owner_user_id integer NOT NULL,
    name text NOT NULL,
    handle text,
    avatar_url text,
    species text,
    breed text,
    age_years integer,
    age_months integer,
    gender text,
    weight numeric(5,2),
    weight_unit text,
    birthday date,
    adoption_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.pets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.pets_id_seq OWNED BY public.pets.id;

--
-- Name: post_barks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.post_barks (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: post_barks_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.post_barks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: post_barks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.post_barks_id_seq OWNED BY public.post_barks.id;

--
-- Name: post_paws; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.post_paws (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: post_paws_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.post_paws_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: post_paws_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.post_paws_id_seq OWNED BY public.post_paws.id;

--
-- Name: posts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    pet_id integer NOT NULL,
    image_url text,
    caption text,
    is_daily_update boolean DEFAULT false NOT NULL,
    post_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;

--
-- Name: routines; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.routines (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    routine_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    title text,
    description text,
    feeding_schedule jsonb,
    walk_schedule jsonb,
    medication_details jsonb,
    photo_check_details jsonb,
    frequency text,
    preferred_day integer,
    times text[],
    days integer[],
    notification_enabled boolean DEFAULT true,
    time_sensitive boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    medical_care_schedule jsonb,
    medical_care_details jsonb,
    wellness_check_schedule jsonb,
    vet_appointment_schedule jsonb
);

--
-- Name: routines_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.routines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: routines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.routines_id_seq OWNED BY public.routines.id;

--
-- Name: social_walk_join_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.social_walk_join_requests (
    id integer NOT NULL,
    social_walk_id integer NOT NULL,
    requester_user_id integer NOT NULL,
    requester_pet_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_walk_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'cancelled'::text])))
);

--
-- Name: social_walk_join_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.social_walk_join_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: social_walk_join_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.social_walk_join_requests_id_seq OWNED BY public.social_walk_join_requests.id;

--
-- Name: social_walks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.social_walks (
    id integer NOT NULL,
    routine_id integer,
    routine_walk_index integer,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    walk_name text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer,
    pace text,
    visibility text DEFAULT 'private'::text NOT NULL,
    meeting_area text,
    meeting_location_details text,
    max_pets integer DEFAULT 4,
    approval_required boolean DEFAULT true,
    status text DEFAULT 'scheduled'::text NOT NULL,
    notes_for_guests text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_walks_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text]))),
    CONSTRAINT social_walks_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'friends_only'::text, 'nearby_pets'::text])))
);

--
-- Name: social_walks_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.social_walks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: social_walks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.social_walks_id_seq OWNED BY public.social_walks.id;

--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_profiles (
    id integer NOT NULL,
    auth_user_id integer NOT NULL,
    full_name character varying(255),
    username character varying(100),
    avatar_url text,
    role character varying(50) DEFAULT 'pet_owner'::character varying NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_role CHECK (((role)::text = ANY ((ARRAY['pet_owner'::character varying, 'vet'::character varying, 'business'::character varying, 'shelter'::character varying, 'admin'::character varying])::text[])))
);

--
-- Name: user_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: user_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_profiles_id_seq OWNED BY public.user_profiles.id;

--
-- Name: vet_appointments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vet_appointments (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    title text NOT NULL,
    appointment_date date NOT NULL,
    appointment_time time without time zone NOT NULL,
    clinic text,
    veterinarian text,
    reason_for_visit text,
    notes text,
    reminder_enabled boolean DEFAULT true,
    time_sensitive boolean DEFAULT true,
    reminder_timing text DEFAULT 'at_time'::text,
    add_to_calendar boolean DEFAULT false,
    calendar_event_id text,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT vet_appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text, 'missed'::text])))
);

--
-- Name: vet_appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vet_appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: vet_appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vet_appointments_id_seq OWNED BY public.vet_appointments.id;

--
-- Name: vet_documents; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vet_documents (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    name text NOT NULL,
    document_type text NOT NULL,
    file_url text NOT NULL,
    document_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: vet_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vet_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: vet_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vet_documents_id_seq OWNED BY public.vet_documents.id;

--
-- Name: vet_notes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vet_notes (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    vet_name text,
    note_date date NOT NULL,
    note text NOT NULL,
    appointment_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: vet_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vet_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: vet_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vet_notes_id_seq OWNED BY public.vet_notes.id;

--
-- Name: auth_accounts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_accounts ALTER COLUMN id SET DEFAULT nextval('public.auth_accounts_id_seq'::regclass);

--
-- Name: auth_sessions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_sessions ALTER COLUMN id SET DEFAULT nextval('public.auth_sessions_id_seq'::regclass);

--
-- Name: auth_users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_users ALTER COLUMN id SET DEFAULT nextval('public.auth_users_id_seq'::regclass);

--
-- Name: health_food_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_food_logs ALTER COLUMN id SET DEFAULT nextval('public.health_food_logs_id_seq'::regclass);

--
-- Name: health_general_checks id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_general_checks ALTER COLUMN id SET DEFAULT nextval('public.health_general_checks_id_seq'::regclass);

--
-- Name: health_medical_care_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_medical_care_logs ALTER COLUMN id SET DEFAULT nextval('public.health_medical_care_logs_id_seq'::regclass);

--
-- Name: health_mobility_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_mobility_logs ALTER COLUMN id SET DEFAULT nextval('public.health_mobility_logs_id_seq'::regclass);

--
-- Name: health_pee_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_pee_logs ALTER COLUMN id SET DEFAULT nextval('public.health_pee_logs_id_seq'::regclass);

--
-- Name: health_photo_checks id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_photo_checks ALTER COLUMN id SET DEFAULT nextval('public.health_photo_checks_id_seq'::regclass);

--
-- Name: health_poo_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_poo_logs ALTER COLUMN id SET DEFAULT nextval('public.health_poo_logs_id_seq'::regclass);

--
-- Name: health_timeline_events id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_timeline_events ALTER COLUMN id SET DEFAULT nextval('public.health_timeline_events_id_seq'::regclass);

--
-- Name: health_vomit_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_vomit_logs ALTER COLUMN id SET DEFAULT nextval('public.health_vomit_logs_id_seq'::regclass);

--
-- Name: health_walk_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_walk_logs ALTER COLUMN id SET DEFAULT nextval('public.health_walk_logs_id_seq'::regclass);

--
-- Name: health_weight_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_weight_logs ALTER COLUMN id SET DEFAULT nextval('public.health_weight_logs_id_seq'::regclass);

--
-- Name: health_wellness_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_wellness_logs ALTER COLUMN id SET DEFAULT nextval('public.health_wellness_logs_id_seq'::regclass);

--
-- Name: pet_allergies id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_allergies ALTER COLUMN id SET DEFAULT nextval('public.pet_allergies_id_seq'::regclass);

--
-- Name: pet_conditions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_conditions ALTER COLUMN id SET DEFAULT nextval('public.pet_conditions_id_seq'::regclass);

--
-- Name: pet_friendships id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships ALTER COLUMN id SET DEFAULT nextval('public.pet_friendships_id_seq'::regclass);

--
-- Name: pet_lab_results id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_lab_results ALTER COLUMN id SET DEFAULT nextval('public.pet_lab_results_id_seq'::regclass);

--
-- Name: pet_medical_profiles id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_medical_profiles ALTER COLUMN id SET DEFAULT nextval('public.pet_medical_profiles_id_seq'::regclass);

--
-- Name: pet_surgeries id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_surgeries ALTER COLUMN id SET DEFAULT nextval('public.pet_surgeries_id_seq'::regclass);

--
-- Name: pets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pets ALTER COLUMN id SET DEFAULT nextval('public.pets_id_seq'::regclass);

--
-- Name: post_barks id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_barks ALTER COLUMN id SET DEFAULT nextval('public.post_barks_id_seq'::regclass);

--
-- Name: post_paws id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_paws ALTER COLUMN id SET DEFAULT nextval('public.post_paws_id_seq'::regclass);

--
-- Name: posts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);

--
-- Name: routines id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.routines ALTER COLUMN id SET DEFAULT nextval('public.routines_id_seq'::regclass);

--
-- Name: social_walk_join_requests id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walk_join_requests ALTER COLUMN id SET DEFAULT nextval('public.social_walk_join_requests_id_seq'::regclass);

--
-- Name: social_walks id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walks ALTER COLUMN id SET DEFAULT nextval('public.social_walks_id_seq'::regclass);

--
-- Name: user_profiles id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles ALTER COLUMN id SET DEFAULT nextval('public.user_profiles_id_seq'::regclass);

--
-- Name: vet_appointments id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_appointments ALTER COLUMN id SET DEFAULT nextval('public.vet_appointments_id_seq'::regclass);

--
-- Name: vet_documents id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_documents ALTER COLUMN id SET DEFAULT nextval('public.vet_documents_id_seq'::regclass);

--
-- Name: vet_notes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_notes ALTER COLUMN id SET DEFAULT nextval('public.vet_notes_id_seq'::regclass);

--
-- Name: auth_accounts auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);

--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);

--
-- Name: auth_users auth_users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);

--
-- Name: auth_verification_token auth_verification_token_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_verification_token
    ADD CONSTRAINT auth_verification_token_pkey PRIMARY KEY (identifier, token);

--
-- Name: health_food_logs health_food_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_food_logs
    ADD CONSTRAINT health_food_logs_pkey PRIMARY KEY (id);

--
-- Name: health_general_checks health_general_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_general_checks
    ADD CONSTRAINT health_general_checks_pkey PRIMARY KEY (id);

--
-- Name: health_medical_care_logs health_medical_care_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_medical_care_logs
    ADD CONSTRAINT health_medical_care_logs_pkey PRIMARY KEY (id);

--
-- Name: health_mobility_logs health_mobility_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_mobility_logs
    ADD CONSTRAINT health_mobility_logs_pkey PRIMARY KEY (id);

--
-- Name: health_pee_logs health_pee_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_pee_logs
    ADD CONSTRAINT health_pee_logs_pkey PRIMARY KEY (id);

--
-- Name: health_photo_checks health_photo_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_photo_checks
    ADD CONSTRAINT health_photo_checks_pkey PRIMARY KEY (id);

--
-- Name: health_poo_logs health_poo_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_poo_logs
    ADD CONSTRAINT health_poo_logs_pkey PRIMARY KEY (id);

--
-- Name: health_timeline_events health_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_timeline_events
    ADD CONSTRAINT health_timeline_events_pkey PRIMARY KEY (id);

--
-- Name: health_vomit_logs health_vomit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_vomit_logs
    ADD CONSTRAINT health_vomit_logs_pkey PRIMARY KEY (id);

--
-- Name: health_walk_logs health_walk_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_walk_logs
    ADD CONSTRAINT health_walk_logs_pkey PRIMARY KEY (id);

--
-- Name: health_weight_logs health_weight_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_weight_logs
    ADD CONSTRAINT health_weight_logs_pkey PRIMARY KEY (id);

--
-- Name: health_wellness_logs health_wellness_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_wellness_logs
    ADD CONSTRAINT health_wellness_logs_pkey PRIMARY KEY (id);

--
-- Name: pet_allergies pet_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_allergies
    ADD CONSTRAINT pet_allergies_pkey PRIMARY KEY (id);

--
-- Name: pet_conditions pet_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_conditions
    ADD CONSTRAINT pet_conditions_pkey PRIMARY KEY (id);

--
-- Name: pet_friendships pet_friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships
    ADD CONSTRAINT pet_friendships_pkey PRIMARY KEY (id);

--
-- Name: pet_lab_results pet_lab_results_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_lab_results
    ADD CONSTRAINT pet_lab_results_pkey PRIMARY KEY (id);

--
-- Name: pet_medical_profiles pet_medical_profiles_pet_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_medical_profiles
    ADD CONSTRAINT pet_medical_profiles_pet_id_key UNIQUE (pet_id);

--
-- Name: pet_medical_profiles pet_medical_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_medical_profiles
    ADD CONSTRAINT pet_medical_profiles_pkey PRIMARY KEY (id);

--
-- Name: pet_surgeries pet_surgeries_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_surgeries
    ADD CONSTRAINT pet_surgeries_pkey PRIMARY KEY (id);

--
-- Name: pets pets_handle_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_handle_key UNIQUE (handle);

--
-- Name: pets pets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_pkey PRIMARY KEY (id);

--
-- Name: post_barks post_barks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_barks
    ADD CONSTRAINT post_barks_pkey PRIMARY KEY (id);

--
-- Name: post_paws post_paws_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_paws
    ADD CONSTRAINT post_paws_pkey PRIMARY KEY (id);

--
-- Name: post_paws post_paws_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_paws
    ADD CONSTRAINT post_paws_post_id_user_id_key UNIQUE (post_id, user_id);

--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);

--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);

--
-- Name: social_walk_join_requests social_walk_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walk_join_requests
    ADD CONSTRAINT social_walk_join_requests_pkey PRIMARY KEY (id);

--
-- Name: social_walks social_walks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walks
    ADD CONSTRAINT social_walks_pkey PRIMARY KEY (id);

--
-- Name: user_profiles user_profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_key UNIQUE (auth_user_id);

--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

--
-- Name: user_profiles user_profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_username_key UNIQUE (username);

--
-- Name: vet_appointments vet_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_appointments
    ADD CONSTRAINT vet_appointments_pkey PRIMARY KEY (id);

--
-- Name: vet_documents vet_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_documents
    ADD CONSTRAINT vet_documents_pkey PRIMARY KEY (id);

--
-- Name: vet_notes vet_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_notes
    ADD CONSTRAINT vet_notes_pkey PRIMARY KEY (id);

--
-- Name: idx_health_food_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_food_logs_logged_at ON public.health_food_logs USING btree (logged_at DESC);

--
-- Name: idx_health_food_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_food_logs_owner_user_id ON public.health_food_logs USING btree (owner_user_id);

--
-- Name: idx_health_food_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_food_logs_pet_id ON public.health_food_logs USING btree (pet_id);

--
-- Name: idx_health_general_checks_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_general_checks_logged_at ON public.health_general_checks USING btree (logged_at DESC);

--
-- Name: idx_health_general_checks_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_general_checks_owner_user_id ON public.health_general_checks USING btree (owner_user_id);

--
-- Name: idx_health_general_checks_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_general_checks_pet_id ON public.health_general_checks USING btree (pet_id);

--
-- Name: idx_health_mobility_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_mobility_logs_logged_at ON public.health_mobility_logs USING btree (logged_at DESC);

--
-- Name: idx_health_mobility_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_mobility_logs_owner_user_id ON public.health_mobility_logs USING btree (owner_user_id);

--
-- Name: idx_health_mobility_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_mobility_logs_pet_id ON public.health_mobility_logs USING btree (pet_id);

--
-- Name: idx_health_pee_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_pee_logs_logged_at ON public.health_pee_logs USING btree (logged_at DESC);

--
-- Name: idx_health_pee_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_pee_logs_owner_user_id ON public.health_pee_logs USING btree (owner_user_id);

--
-- Name: idx_health_pee_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_pee_logs_pet_id ON public.health_pee_logs USING btree (pet_id);

--
-- Name: idx_health_photo_checks_body_area; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_photo_checks_body_area ON public.health_photo_checks USING btree (body_area);

--
-- Name: idx_health_photo_checks_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_photo_checks_created_at ON public.health_photo_checks USING btree (created_at DESC);

--
-- Name: idx_health_photo_checks_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_photo_checks_owner_user_id ON public.health_photo_checks USING btree (owner_user_id);

--
-- Name: idx_health_photo_checks_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_photo_checks_pet_id ON public.health_photo_checks USING btree (pet_id);

--
-- Name: idx_health_poo_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_poo_logs_logged_at ON public.health_poo_logs USING btree (logged_at DESC);

--
-- Name: idx_health_poo_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_poo_logs_owner_user_id ON public.health_poo_logs USING btree (owner_user_id);

--
-- Name: idx_health_poo_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_poo_logs_pet_id ON public.health_poo_logs USING btree (pet_id);

--
-- Name: idx_health_timeline_events_event_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_timeline_events_event_time ON public.health_timeline_events USING btree (event_time DESC);

--
-- Name: idx_health_timeline_events_event_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_timeline_events_event_type ON public.health_timeline_events USING btree (event_type);

--
-- Name: idx_health_timeline_events_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_timeline_events_owner_user_id ON public.health_timeline_events USING btree (owner_user_id);

--
-- Name: idx_health_timeline_events_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_timeline_events_pet_id ON public.health_timeline_events USING btree (pet_id);

--
-- Name: idx_health_vomit_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_vomit_logs_logged_at ON public.health_vomit_logs USING btree (logged_at DESC);

--
-- Name: idx_health_vomit_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_vomit_logs_owner_user_id ON public.health_vomit_logs USING btree (owner_user_id);

--
-- Name: idx_health_vomit_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_vomit_logs_pet_id ON public.health_vomit_logs USING btree (pet_id);

--
-- Name: idx_health_walk_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_walk_logs_owner_user_id ON public.health_walk_logs USING btree (owner_user_id);

--
-- Name: idx_health_walk_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_walk_logs_pet_id ON public.health_walk_logs USING btree (pet_id);

--
-- Name: idx_health_walk_logs_start_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_walk_logs_start_time ON public.health_walk_logs USING btree (start_time DESC);

--
-- Name: idx_health_weight_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_weight_logs_logged_at ON public.health_weight_logs USING btree (logged_at DESC);

--
-- Name: idx_health_weight_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_weight_logs_owner_user_id ON public.health_weight_logs USING btree (owner_user_id);

--
-- Name: idx_health_weight_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_health_weight_logs_pet_id ON public.health_weight_logs USING btree (pet_id);

--
-- Name: idx_mcl_owner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mcl_owner ON public.health_medical_care_logs USING btree (owner_user_id);

--
-- Name: idx_mcl_pet_given; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mcl_pet_given ON public.health_medical_care_logs USING btree (pet_id, given_at DESC);

--
-- Name: idx_pet_allergies_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_allergies_owner_user_id ON public.pet_allergies USING btree (owner_user_id);

--
-- Name: idx_pet_allergies_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_allergies_pet_id ON public.pet_allergies USING btree (pet_id);

--
-- Name: idx_pet_conditions_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_conditions_owner_user_id ON public.pet_conditions USING btree (owner_user_id);

--
-- Name: idx_pet_conditions_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_conditions_pet_id ON public.pet_conditions USING btree (pet_id);

--
-- Name: idx_pet_friendships_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_created_at ON public.pet_friendships USING btree (created_at DESC);

--
-- Name: idx_pet_friendships_receiver_pet; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_receiver_pet ON public.pet_friendships USING btree (receiver_pet_id);

--
-- Name: idx_pet_friendships_receiver_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_receiver_user_id ON public.pet_friendships USING btree (receiver_user_id);

--
-- Name: idx_pet_friendships_requester_pet; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_requester_pet ON public.pet_friendships USING btree (requester_pet_id);

--
-- Name: idx_pet_friendships_requester_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_requester_user_id ON public.pet_friendships USING btree (requester_user_id);

--
-- Name: idx_pet_friendships_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_friendships_status ON public.pet_friendships USING btree (status);

--
-- Name: idx_pet_lab_results_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_lab_results_date ON public.pet_lab_results USING btree (test_date DESC);

--
-- Name: idx_pet_lab_results_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_lab_results_owner_user_id ON public.pet_lab_results USING btree (owner_user_id);

--
-- Name: idx_pet_lab_results_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_lab_results_pet_id ON public.pet_lab_results USING btree (pet_id);

--
-- Name: idx_pet_medical_profiles_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_medical_profiles_owner_user_id ON public.pet_medical_profiles USING btree (owner_user_id);

--
-- Name: idx_pet_medical_profiles_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_medical_profiles_pet_id ON public.pet_medical_profiles USING btree (pet_id);

--
-- Name: idx_pet_surgeries_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_surgeries_date ON public.pet_surgeries USING btree (surgery_date DESC);

--
-- Name: idx_pet_surgeries_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_surgeries_owner_user_id ON public.pet_surgeries USING btree (owner_user_id);

--
-- Name: idx_pet_surgeries_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pet_surgeries_pet_id ON public.pet_surgeries USING btree (pet_id);

--
-- Name: idx_pets_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pets_created_at ON public.pets USING btree (created_at DESC);

--
-- Name: idx_pets_handle; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pets_handle ON public.pets USING btree (handle);

--
-- Name: idx_pets_owner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pets_owner ON public.pets USING btree (owner_user_id);

--
-- Name: idx_pets_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pets_owner_user_id ON public.pets USING btree (owner_user_id);

--
-- Name: idx_post_barks_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_barks_created_at ON public.post_barks USING btree (created_at DESC);

--
-- Name: idx_post_barks_post; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_barks_post ON public.post_barks USING btree (post_id);

--
-- Name: idx_post_barks_post_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_barks_post_id ON public.post_barks USING btree (post_id);

--
-- Name: idx_post_barks_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_barks_user ON public.post_barks USING btree (user_id);

--
-- Name: idx_post_barks_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_barks_user_id ON public.post_barks USING btree (user_id);

--
-- Name: idx_post_paws_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_paws_created_at ON public.post_paws USING btree (created_at DESC);

--
-- Name: idx_post_paws_post; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_paws_post ON public.post_paws USING btree (post_id);

--
-- Name: idx_post_paws_post_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_paws_post_id ON public.post_paws USING btree (post_id);

--
-- Name: idx_post_paws_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_paws_user ON public.post_paws USING btree (user_id);

--
-- Name: idx_post_paws_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_post_paws_user_id ON public.post_paws USING btree (user_id);

--
-- Name: idx_posts_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_created_at ON public.posts USING btree (created_at DESC);

--
-- Name: idx_posts_daily_update; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_daily_update ON public.posts USING btree (is_daily_update, post_date DESC);

--
-- Name: idx_posts_one_daily_per_pet_per_day; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_posts_one_daily_per_pet_per_day ON public.posts USING btree (pet_id, post_date) WHERE (is_daily_update = true);

--
-- Name: idx_posts_pet; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_pet ON public.posts USING btree (pet_id);

--
-- Name: idx_posts_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_pet_id ON public.posts USING btree (pet_id);

--
-- Name: idx_posts_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_user ON public.posts USING btree (user_id);

--
-- Name: idx_posts_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_posts_user_id ON public.posts USING btree (user_id);

--
-- Name: idx_routines_is_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routines_is_active ON public.routines USING btree (is_active);

--
-- Name: idx_routines_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routines_owner_user_id ON public.routines USING btree (owner_user_id);

--
-- Name: idx_routines_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routines_pet_id ON public.routines USING btree (pet_id);

--
-- Name: idx_routines_routine_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routines_routine_type ON public.routines USING btree (routine_type);

--
-- Name: idx_social_walk_join_requests_requester_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walk_join_requests_requester_user_id ON public.social_walk_join_requests USING btree (requester_user_id);

--
-- Name: idx_social_walk_join_requests_social_walk_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walk_join_requests_social_walk_id ON public.social_walk_join_requests USING btree (social_walk_id);

--
-- Name: idx_social_walk_join_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walk_join_requests_status ON public.social_walk_join_requests USING btree (status);

--
-- Name: idx_social_walk_join_requests_unique_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_social_walk_join_requests_unique_pending ON public.social_walk_join_requests USING btree (social_walk_id, requester_user_id, requester_pet_id) WHERE (status = 'pending'::text);

--
-- Name: idx_social_walks_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walks_owner_user_id ON public.social_walks USING btree (owner_user_id);

--
-- Name: idx_social_walks_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walks_pet_id ON public.social_walks USING btree (pet_id);

--
-- Name: idx_social_walks_scheduled_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walks_scheduled_at ON public.social_walks USING btree (scheduled_at);

--
-- Name: idx_social_walks_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walks_status ON public.social_walks USING btree (status);

--
-- Name: idx_social_walks_visibility; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_social_walks_visibility ON public.social_walks USING btree (visibility);

--
-- Name: idx_user_profiles_auth_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_auth_user ON public.user_profiles USING btree (auth_user_id);

--
-- Name: idx_user_profiles_auth_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_auth_user_id ON public.user_profiles USING btree (auth_user_id);

--
-- Name: idx_user_profiles_username; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_username ON public.user_profiles USING btree (username);

--
-- Name: idx_vet_appointments_appointment_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_appointments_appointment_date ON public.vet_appointments USING btree (appointment_date);

--
-- Name: idx_vet_appointments_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_appointments_deleted_at ON public.vet_appointments USING btree (deleted_at);

--
-- Name: idx_vet_appointments_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_appointments_owner_user_id ON public.vet_appointments USING btree (owner_user_id);

--
-- Name: idx_vet_appointments_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_appointments_pet_id ON public.vet_appointments USING btree (pet_id);

--
-- Name: idx_vet_appointments_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_appointments_status ON public.vet_appointments USING btree (status);

--
-- Name: idx_vet_documents_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_documents_date ON public.vet_documents USING btree (document_date DESC);

--
-- Name: idx_vet_documents_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_documents_owner_user_id ON public.vet_documents USING btree (owner_user_id);

--
-- Name: idx_vet_documents_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_documents_pet_id ON public.vet_documents USING btree (pet_id);

--
-- Name: idx_vet_notes_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_notes_date ON public.vet_notes USING btree (note_date DESC);

--
-- Name: idx_vet_notes_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_notes_owner_user_id ON public.vet_notes USING btree (owner_user_id);

--
-- Name: idx_vet_notes_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vet_notes_pet_id ON public.vet_notes USING btree (pet_id);

--
-- Name: idx_wellness_logs_check_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wellness_logs_check_type ON public.health_wellness_logs USING btree (check_type);

--
-- Name: idx_wellness_logs_logged_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wellness_logs_logged_at ON public.health_wellness_logs USING btree (logged_at DESC);

--
-- Name: idx_wellness_logs_owner_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wellness_logs_owner_user_id ON public.health_wellness_logs USING btree (owner_user_id);

--
-- Name: idx_wellness_logs_pet_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wellness_logs_pet_id ON public.health_wellness_logs USING btree (pet_id);

--
-- Name: auth_accounts auth_accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.auth_users(id) ON DELETE CASCADE;

--
-- Name: auth_sessions auth_sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.auth_users(id) ON DELETE CASCADE;

--
-- Name: health_food_logs health_food_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_food_logs
    ADD CONSTRAINT health_food_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_food_logs health_food_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_food_logs
    ADD CONSTRAINT health_food_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_general_checks health_general_checks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_general_checks
    ADD CONSTRAINT health_general_checks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_general_checks health_general_checks_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_general_checks
    ADD CONSTRAINT health_general_checks_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_medical_care_logs health_medical_care_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_medical_care_logs
    ADD CONSTRAINT health_medical_care_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id);

--
-- Name: health_medical_care_logs health_medical_care_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_medical_care_logs
    ADD CONSTRAINT health_medical_care_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id);

--
-- Name: health_medical_care_logs health_medical_care_logs_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_medical_care_logs
    ADD CONSTRAINT health_medical_care_logs_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id);

--
-- Name: health_mobility_logs health_mobility_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_mobility_logs
    ADD CONSTRAINT health_mobility_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_mobility_logs health_mobility_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_mobility_logs
    ADD CONSTRAINT health_mobility_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_pee_logs health_pee_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_pee_logs
    ADD CONSTRAINT health_pee_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_pee_logs health_pee_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_pee_logs
    ADD CONSTRAINT health_pee_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_photo_checks health_photo_checks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_photo_checks
    ADD CONSTRAINT health_photo_checks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_photo_checks health_photo_checks_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_photo_checks
    ADD CONSTRAINT health_photo_checks_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_poo_logs health_poo_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_poo_logs
    ADD CONSTRAINT health_poo_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_poo_logs health_poo_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_poo_logs
    ADD CONSTRAINT health_poo_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_timeline_events health_timeline_events_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_timeline_events
    ADD CONSTRAINT health_timeline_events_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_timeline_events health_timeline_events_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_timeline_events
    ADD CONSTRAINT health_timeline_events_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_vomit_logs health_vomit_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_vomit_logs
    ADD CONSTRAINT health_vomit_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_vomit_logs health_vomit_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_vomit_logs
    ADD CONSTRAINT health_vomit_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_walk_logs health_walk_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_walk_logs
    ADD CONSTRAINT health_walk_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_walk_logs health_walk_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_walk_logs
    ADD CONSTRAINT health_walk_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_weight_logs health_weight_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_weight_logs
    ADD CONSTRAINT health_weight_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_weight_logs health_weight_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_weight_logs
    ADD CONSTRAINT health_weight_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_wellness_logs health_wellness_logs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_wellness_logs
    ADD CONSTRAINT health_wellness_logs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: health_wellness_logs health_wellness_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_wellness_logs
    ADD CONSTRAINT health_wellness_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: health_wellness_logs health_wellness_logs_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.health_wellness_logs
    ADD CONSTRAINT health_wellness_logs_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE SET NULL;

--
-- Name: pet_allergies pet_allergies_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_allergies
    ADD CONSTRAINT pet_allergies_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_allergies pet_allergies_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_allergies
    ADD CONSTRAINT pet_allergies_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_conditions pet_conditions_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_conditions
    ADD CONSTRAINT pet_conditions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_conditions pet_conditions_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_conditions
    ADD CONSTRAINT pet_conditions_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_friendships pet_friendships_receiver_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships
    ADD CONSTRAINT pet_friendships_receiver_pet_id_fkey FOREIGN KEY (receiver_pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_friendships pet_friendships_receiver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships
    ADD CONSTRAINT pet_friendships_receiver_user_id_fkey FOREIGN KEY (receiver_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_friendships pet_friendships_requester_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships
    ADD CONSTRAINT pet_friendships_requester_pet_id_fkey FOREIGN KEY (requester_pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_friendships pet_friendships_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_friendships
    ADD CONSTRAINT pet_friendships_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_lab_results pet_lab_results_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_lab_results
    ADD CONSTRAINT pet_lab_results_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_lab_results pet_lab_results_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_lab_results
    ADD CONSTRAINT pet_lab_results_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_medical_profiles pet_medical_profiles_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_medical_profiles
    ADD CONSTRAINT pet_medical_profiles_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_medical_profiles pet_medical_profiles_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_medical_profiles
    ADD CONSTRAINT pet_medical_profiles_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pet_surgeries pet_surgeries_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_surgeries
    ADD CONSTRAINT pet_surgeries_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: pet_surgeries pet_surgeries_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pet_surgeries
    ADD CONSTRAINT pet_surgeries_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: pets pets_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: post_barks post_barks_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_barks
    ADD CONSTRAINT post_barks_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

--
-- Name: post_barks post_barks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_barks
    ADD CONSTRAINT post_barks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: post_paws post_paws_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_paws
    ADD CONSTRAINT post_paws_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

--
-- Name: post_paws post_paws_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.post_paws
    ADD CONSTRAINT post_paws_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: posts posts_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: routines routines_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: routines routines_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: social_walk_join_requests social_walk_join_requests_requester_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walk_join_requests
    ADD CONSTRAINT social_walk_join_requests_requester_pet_id_fkey FOREIGN KEY (requester_pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: social_walk_join_requests social_walk_join_requests_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walk_join_requests
    ADD CONSTRAINT social_walk_join_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: social_walk_join_requests social_walk_join_requests_social_walk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walk_join_requests
    ADD CONSTRAINT social_walk_join_requests_social_walk_id_fkey FOREIGN KEY (social_walk_id) REFERENCES public.social_walks(id) ON DELETE CASCADE;

--
-- Name: social_walks social_walks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walks
    ADD CONSTRAINT social_walks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: social_walks social_walks_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walks
    ADD CONSTRAINT social_walks_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: social_walks social_walks_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.social_walks
    ADD CONSTRAINT social_walks_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE SET NULL;

--
-- Name: user_profiles user_profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;

--
-- Name: vet_appointments vet_appointments_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_appointments
    ADD CONSTRAINT vet_appointments_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: vet_appointments vet_appointments_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_appointments
    ADD CONSTRAINT vet_appointments_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: vet_documents vet_documents_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_documents
    ADD CONSTRAINT vet_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: vet_documents vet_documents_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_documents
    ADD CONSTRAINT vet_documents_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: vet_notes vet_notes_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_notes
    ADD CONSTRAINT vet_notes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.vet_appointments(id) ON DELETE SET NULL;

--
-- Name: vet_notes vet_notes_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_notes
    ADD CONSTRAINT vet_notes_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

--
-- Name: vet_notes vet_notes_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vet_notes
    ADD CONSTRAINT vet_notes_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

--
-- PostgreSQL database dump complete
--

-- Data

--
-- Addendum (post-dump): reminder_dismissals — durable skip/dismiss for overdue
-- reminder instances. Added by migration 0011_reminder_dismissals.sql (Ticket 8).
-- Kept here so this file stays the source of truth the migrations restate.
--

CREATE TABLE IF NOT EXISTS public.reminder_dismissals (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    pet_id integer NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    owner_user_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    routine_id integer REFERENCES public.routines(id) ON DELETE SET NULL,
    reminder_type text NOT NULL,
    instance_key text NOT NULL,
    scheduled_date date,
    dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_dismissals_unique
    ON public.reminder_dismissals (owner_user_id, pet_id, instance_key);
CREATE INDEX IF NOT EXISTS idx_reminder_dismissals_pet_id
    ON public.reminder_dismissals (pet_id);
CREATE INDEX IF NOT EXISTS idx_reminder_dismissals_owner_user_id
    ON public.reminder_dismissals (owner_user_id);


--
-- Addendum (post-dump): provider spine — providers, provider_locations,
-- provider_staff, provider_services, provider_reviews. Added by migration
-- 0014_providers.sql (Provider/Business side, docs/provider-design.md §2).
-- Every user reference is user_profiles(id), never auth_users. Schema only —
-- consent tables (care_access_*) and vet_appointments are NOT touched here.
-- Kept here so this file stays the source of truth the migrations restate.
--

CREATE TABLE IF NOT EXISTS public.providers (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    owner_user_profile_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    provider_type text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    bio text,
    logo_url text,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT providers_slug_key UNIQUE (slug),
    CONSTRAINT providers_status_check CHECK (status = ANY (ARRAY['draft','published']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_providers_owner_user_profile_id
    ON public.providers (owner_user_profile_id);

CREATE TABLE IF NOT EXISTS public.provider_locations (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    provider_id integer NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    name text,
    address text,
    lat numeric(9,6),
    lng numeric(9,6),
    hours_json jsonb,
    phone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_locations_provider_id
    ON public.provider_locations (provider_id);

CREATE TABLE IF NOT EXISTS public.provider_staff (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    provider_id integer NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    user_profile_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'invited',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT provider_staff_provider_user_key UNIQUE (provider_id, user_profile_id),
    CONSTRAINT provider_staff_role_check CHECK (role = ANY (ARRAY['owner','admin','staff','vet']::text[])),
    CONSTRAINT provider_staff_status_check CHECK (status = ANY (ARRAY['invited','active','removed']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_provider_staff_provider_id
    ON public.provider_staff (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_user_profile_id
    ON public.provider_staff (user_profile_id);

CREATE TABLE IF NOT EXISTS public.provider_services (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    provider_id integer NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    duration_min integer,
    price_cents integer,
    deposit_cents integer,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_services_provider_id
    ON public.provider_services (provider_id);

CREATE TABLE IF NOT EXISTS public.provider_reviews (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    provider_id integer NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    owner_user_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    pet_id integer NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    rating integer NOT NULL,
    body text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT provider_reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS idx_provider_reviews_provider_id
    ON public.provider_reviews (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_reviews_owner_user_id
    ON public.provider_reviews (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_reviews_pet_id
    ON public.provider_reviews (pet_id);

-- Addendum (post-dump): consent cornerstone — care_access_grants and the
-- append-only care_access_audit. Added by migration 0015_care_access.sql
-- (Provider/Business side, docs/provider-design.md §2 "Consent" + §3 enforcement).
-- Per-(pet ↔ provider) scoped/revocable/audited grant; assertCareAccess (web
-- src/app/api/utils/) is the only sanctioned path provider→pet-data.
-- owner_user_id and staff_user_id are user_profiles(id), NEVER auth_users.
-- booking_id is a plain nullable integer (no FK) until vet_appointments is
-- extended in 0016. vet_appointments is NOT touched here.

CREATE TABLE IF NOT EXISTS public.care_access_grants (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    pet_id integer NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    owner_user_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    provider_id integer NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    scopes text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    requested_by text NOT NULL,
    booking_id integer,
    granted_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT care_access_grants_status_check CHECK (status = ANY (ARRAY['pending','active','revoked','expired']::text[])),
    CONSTRAINT care_access_grants_requested_by_check CHECK (requested_by = ANY (ARRAY['owner','provider']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_care_access_grants_provider_pet_status
    ON public.care_access_grants (provider_id, pet_id, status);
CREATE INDEX IF NOT EXISTS idx_care_access_grants_owner_status
    ON public.care_access_grants (owner_user_id, status);

CREATE TABLE IF NOT EXISTS public.care_access_audit (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    grant_id integer NOT NULL REFERENCES public.care_access_grants(id) ON DELETE CASCADE,
    staff_user_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    action text NOT NULL,
    resource text,
    at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT care_access_audit_action_check CHECK (action = ANY (ARRAY['read','write']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_care_access_audit_grant_id
    ON public.care_access_audit (grant_id);

-- Addendum (post-dump): vaccinations + booking link. Added by migration
-- 0016_vaccinations_and_booking.sql (Provider/Business side,
-- docs/provider-design.md §2 "Vet-type reuse"). Two changes:
--   1. NEW pet_vaccinations — owner-visible vaccination history (the gap that no
--      vaccination table existed). Soft-delete (deleted_at) matching vet_appointments.
--   2. vet_appointments gains nullable/defaulted booking columns linking an owner
--      booking to a provider/location/service/staff. Additive only — the existing
--      status column and all existing columns are untouched, so owner-created rows
--      and the reminder engine are unaffected.
-- Every user reference is user_profiles(id), NEVER auth_users. Schema only —
-- pet_vaccinations is NOT wired into any route yet (ticket 8).

CREATE TABLE IF NOT EXISTS public.pet_vaccinations (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    pet_id integer NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    owner_user_id integer NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    date_given date,
    expires_on date,
    lot text,
    administered_by_provider_id integer REFERENCES public.providers(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_pet_vaccinations_pet_id
    ON public.pet_vaccinations (pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_vaccinations_owner_user_id
    ON public.pet_vaccinations (owner_user_id);

ALTER TABLE public.vet_appointments
    ADD COLUMN IF NOT EXISTS provider_id integer REFERENCES public.providers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS provider_location_id integer REFERENCES public.provider_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_id integer REFERENCES public.provider_services(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS staff_user_id integer REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS booking_status text,
    ADD COLUMN IF NOT EXISTS source text DEFAULT 'owner';

CREATE INDEX IF NOT EXISTS idx_vet_appointments_provider_id
    ON public.vet_appointments (provider_id);


-- 0017_booking_status_check.sql (Provider/Business side, ticket 6a owner booking).
-- Lock the two free-text booking columns 0016 added with CHECK constraints:
--   booking_status  requested|confirmed|declined|cancelled  (NULL allowed; the
--                   provider-workflow field, DISTINCT from the existing status
--                   column scheduled|completed|cancelled|missed)
--   source          owner|provider                          (NULL allowed)
-- Existing rows pass (booking_status NULL, source 'owner' default). Idempotent:
-- drop-if-exists then add (no ADD CONSTRAINT IF NOT EXISTS in Postgres). Schema
-- only — no data change, reminder engine unaffected.

ALTER TABLE public.vet_appointments
    DROP CONSTRAINT IF EXISTS vet_appointments_booking_status_check;
ALTER TABLE public.vet_appointments
    ADD CONSTRAINT vet_appointments_booking_status_check
    CHECK (
        booking_status IS NULL
        OR booking_status = ANY (ARRAY['requested', 'confirmed', 'declined', 'cancelled'])
    );

ALTER TABLE public.vet_appointments
    DROP CONSTRAINT IF EXISTS vet_appointments_source_check;
ALTER TABLE public.vet_appointments
    ADD CONSTRAINT vet_appointments_source_check
    CHECK (
        source IS NULL
        OR source = ANY (ARRAY['owner', 'provider'])
    );


-- 0018_vaccination_reconciliation.sql (Provider/Business side — vaccination SSOT).
-- Make pet_vaccinations the single source of truth for vaccination history without
-- touching the reminder engine. Adds provenance columns so owner vaccine
-- completions can WRITE THROUGH from health_medical_care_logs into pet_vaccinations
-- (and so existing owner-logged vaccines can be backfilled) without ever creating
-- duplicates:
--   source                      'owner' | 'provider' (free-text; backfilled by
--                               administered_by_provider_id IS NOT NULL)
--   source_medical_care_log_id  links a row to the medical-care log that produced
--                               it; ON DELETE SET NULL (a deleted log unlinks, not
--                               deletes, the vaccination history)
-- Plus a UNIQUE partial index so a given log maps to AT MOST one vaccination row.
-- The migration also backfills source for existing rows and inserts one
-- pet_vaccinations row per administered owner vaccine log (status in
-- ('given','completed')). Idempotent / re-runnable.

ALTER TABLE public.pet_vaccinations
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS source_medical_care_log_id integer
        REFERENCES public.health_medical_care_logs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pet_vaccinations_source_log
    ON public.pet_vaccinations (source_medical_care_log_id)
    WHERE source_medical_care_log_id IS NOT NULL;


-- 0019_rls_role_helpers.sql (RLS hardening R2a — docs/rls-hardening.md §R2a).
-- The non-owner application role + reusable identity / provider-access helpers that
-- every table's RLS policies build on. No policies on real tables here (pets is 0020).
-- ⚠️ HARNESS-ONLY: proven in the integration harness; NOT applied to Supabase yet —
-- R3 applies the whole R2 set at the DATABASE_URL cutover to pawpi_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pawpi_app') THEN
    CREATE ROLE pawpi_app LOGIN PASSWORD 'pawpi_app' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO pawpi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pawpi_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pawpi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pawpi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO pawpi_app;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::int
$$;

-- SECURITY DEFINER (owned by the privileged role) + pinned search_path: the
-- membership/grant lookup is NOT re-filtered by the future RLS of provider_staff /
-- care_access_grants / vet_appointments (avoids under-counting + policy recursion).
CREATE OR REPLACE FUNCTION public.app_provider_has_grant(p_pet_id integer, p_scope text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM provider_staff ps
    JOIN care_access_grants g ON g.provider_id = ps.provider_id
    WHERE ps.user_profile_id = current_app_user_id()
      AND ps.status = 'active'
      AND g.pet_id = p_pet_id
      AND g.status = 'active'
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND (p_scope IS NULL OR p_scope = ANY (g.scopes))
  )
$$;

CREATE OR REPLACE FUNCTION public.app_provider_has_booking(p_pet_id integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM provider_staff ps
    JOIN vet_appointments va ON va.provider_id = ps.provider_id
    WHERE ps.user_profile_id = current_app_user_id()
      AND ps.status = 'active'
      AND va.pet_id = p_pet_id
      AND va.deleted_at IS NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO pawpi_app;
GRANT EXECUTE ON FUNCTION public.app_provider_has_grant(integer, text) TO pawpi_app;
GRANT EXECUTE ON FUNCTION public.app_provider_has_booking(integer) TO pawpi_app;


-- 0020_rls_pets.sql (RLS hardening R2a). ENABLE + FORCE ROW LEVEL SECURITY on `pets`
-- only, mirroring the app's current access: owner reads/writes their pets; a provider
-- with an active grant OR a non-deleted booking READS the pet (no provider writes).
-- ⚠️ HARNESS-ONLY — NOT applied to Supabase yet (R3). See docs/rls-hardening.md §R2a
-- for the social/public pet-profile read follow-up (broader than these predicates).

ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pets_owner_all ON public.pets;
CREATE POLICY pets_owner_all ON public.pets
  FOR ALL
  USING (owner_user_id = current_app_user_id())
  WITH CHECK (owner_user_id = current_app_user_id());

DROP POLICY IF EXISTS pets_provider_read ON public.pets;
CREATE POLICY pets_provider_read ON public.pets
  FOR SELECT
  USING (app_provider_has_grant(id) OR app_provider_has_booking(id));


-- 0021_rls_social.sql (RLS hardening R2b — docs/rls-hardening.md §R2b). The SOCIAL /
-- PUBLIC-READ table group: any authenticated user READS (global feed + social
-- profiles); only the ACTOR WRITES their own rows. Opposite shape from the private/
-- medical group (R2c). "any authed" = current_app_user_id() IS NOT NULL.
-- ⚠️ HARNESS-ONLY — NOT applied to Supabase yet (R3 applies the whole R2 set at the
-- DATABASE_URL cutover). DML/sequence grants come from 0019's blanket grants.

-- pets: CORRECT the R2a read rule. R2a scoped pets reads to owner + provider grant/
-- booking, but the social profile read + feed JOIN expose ANY pet to ANY signed-in
-- user. Drop the provider-read policy (subsumed) and add an any-authed SELECT policy.
-- pets_owner_all (above) is untouched → writes stay owner-only; permissive SELECT
-- policies OR together → read = any authed. (The provider helpers stay; they gate
-- the medical tables in R2c, not pets.)
DROP POLICY IF EXISTS pets_provider_read ON public.pets;
DROP POLICY IF EXISTS pets_authed_read ON public.pets;
CREATE POLICY pets_authed_read ON public.pets
  FOR SELECT
  USING (current_app_user_id() IS NOT NULL);

-- posts: read any authed (feed + profile grids); write the author (user_id = me).
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posts_authed_read ON public.posts;
CREATE POLICY posts_authed_read ON public.posts
  FOR SELECT
  USING (current_app_user_id() IS NOT NULL);
DROP POLICY IF EXISTS posts_author_all ON public.posts;
CREATE POLICY posts_author_all ON public.posts
  FOR ALL
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- post_paws: read any authed (counts + user_has_pawed); write the actor (user_id = me).
ALTER TABLE public.post_paws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_paws FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_paws_authed_read ON public.post_paws;
CREATE POLICY post_paws_authed_read ON public.post_paws
  FOR SELECT
  USING (current_app_user_id() IS NOT NULL);
DROP POLICY IF EXISTS post_paws_author_all ON public.post_paws;
CREATE POLICY post_paws_author_all ON public.post_paws
  FOR ALL
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- post_barks: read any authed (comments + counts); write the author (user_id = me).
-- pet_id is nullable/legacy (commenting pet) — NOT gated on.
ALTER TABLE public.post_barks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_barks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_barks_authed_read ON public.post_barks;
CREATE POLICY post_barks_authed_read ON public.post_barks
  FOR SELECT
  USING (current_app_user_id() IS NOT NULL);
DROP POLICY IF EXISTS post_barks_author_all ON public.post_barks;
CREATE POLICY post_barks_author_all ON public.post_barks
  FOR ALL
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- pet_follows: read any authed (counts, isFollowing, feed subqueries); write
-- (INSERT/DELETE) the caller must OWN the FOLLOWER pet. The EXISTS on pets is
-- evaluated under pets' RLS as pawpi_app — the follower is the caller's OWN pet, so
-- pets_owner_all makes it visible (no SECURITY DEFINER needed).
ALTER TABLE public.pet_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_follows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pet_follows_authed_read ON public.pet_follows;
CREATE POLICY pet_follows_authed_read ON public.pet_follows
  FOR SELECT
  USING (current_app_user_id() IS NOT NULL);
DROP POLICY IF EXISTS pet_follows_owner_write ON public.pet_follows;
CREATE POLICY pet_follows_owner_write ON public.pet_follows
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.pets p
    WHERE p.id = pet_follows.follower_pet_id
      AND p.owner_user_id = current_app_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pets p
    WHERE p.id = pet_follows.follower_pet_id
      AND p.owner_user_id = current_app_user_id()
  ));

-- pet_friendships: PARTICIPANT-scoped read AND write (NOT public). The only app
-- usage (social-walks GET) reads friendships where one of the caller's pets
-- participates → caller is requester_user_id OR receiver_user_id. No friendship
-- write route exists today; this safe-default participant scope avoids leaving the
-- table un-policied once FORCE RLS is on.
ALTER TABLE public.pet_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_friendships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pet_friendships_participant ON public.pet_friendships;
CREATE POLICY pet_friendships_participant ON public.pet_friendships
  FOR ALL
  USING (
    requester_user_id = current_app_user_id()
    OR receiver_user_id = current_app_user_id()
  )
  WITH CHECK (
    requester_user_id = current_app_user_id()
    OR receiver_user_id = current_app_user_id()
  );


-- 0022_rls_owner_private.sql (RLS hardening R2c — docs/rls-hardening.md §R2c). The
-- OWNER-ONLY PRIVATE table group: a pet's private health/scheduling data, read AND
-- written ONLY by the owner (owner_user_id = current_app_user_id()). Opposite of the
-- social group (R2b): NO any-authed read, NO provider access on ANY of these tables.
-- A provider EVEN WITH an active care grant gets ZERO rows here (the grant/booking
-- helpers gate the R2d medical-record tables, NOT these). Uniform single FOR ALL
-- policy per table, applied in a loop. NOTE: care-access scopes health_logs_read/
-- _write are reserved for a FUTURE provider type; no route grants providers access
-- to health_* today, so they are owner-only NOW (that feature's ticket adds the
-- branch). ⚠️ HARNESS-ONLY — NOT applied to Supabase yet (R3 applies the whole R2
-- set at the DATABASE_URL cutover). DML/sequence grants come from 0019's blanket grants.
DO $$
DECLARE
  t text;
  owner_private_tables text[] := ARRAY[
    'health_food_logs',
    'health_general_checks',
    'health_medical_care_logs',
    'health_mobility_logs',
    'health_pee_logs',
    'health_photo_checks',
    'health_poo_logs',
    'health_vomit_logs',
    'health_walk_logs',
    'health_weight_logs',
    'health_wellness_logs',
    'health_timeline_events',
    'pet_allergies',
    'pet_conditions',
    'pet_lab_results',
    'pet_surgeries',
    'vet_documents',
    'routines',
    'reminder_dismissals'
  ];
BEGIN
  FOREACH t IN ARRAY owner_private_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      || 'USING (owner_user_id = current_app_user_id()) '
      || 'WITH CHECK (owner_user_id = current_app_user_id())',
      t || '_owner_all', t
    );
  END LOOP;
END
$$;

-- 0023_rls_provider_records.sql (RLS hardening R2d — docs/rls-hardening.md §R2d). The
-- PROVIDER-ACCESSIBLE MEDICAL records + the bookings table. Unlike R2b (public read) and
-- R2c (owner-only), provider access is REAL here, so READ vs WRITE scopes DIFFER and the
-- policies are split per command: a FOR ALL owner policy (owner always allowed) + narrow
-- provider command policies. Mirrors the routes EXACTLY —
--   pet_medical_profiles: SELECT owner OR grant(medical_read); writes owner only.
--   vet_notes: SELECT owner OR grant(medical_read); INSERT owner OR grant(medical_write);
--     UPDATE/DELETE owner only (notes route is INSERT-only for providers).
--   pet_vaccinations: SELECT owner OR grant(medical_read); INSERT owner OR
--     grant(vaccinations_write); UPDATE/DELETE owner only. (Owner write-through stays the
--     owner INSERT branch.)
--   vet_appointments: HYBRID by STAFF MEMBERSHIP (not a grant) — SELECT/UPDATE owner OR
--     active-staff-of(provider_id) (booking inbox/actions); INSERT/DELETE owner only.
-- New helper app_is_active_staff_of(provider_id): SECURITY DEFINER + pinned search_path +
-- STABLE (the booking analogue of 0019's app_provider_has_grant; reads provider_staff,
-- which gets RLS in R2e — DEFINER avoids re-filter/recursion). DML/sequence grants come
-- from 0019's blanket grants (all four tables predate 0019). ⚠️ HARNESS-ONLY — NOT applied
-- to Supabase yet (R3 applies the whole R2 set at the DATABASE_URL cutover to pawpi_app).
CREATE OR REPLACE FUNCTION public.app_is_active_staff_of(p_provider_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM provider_staff ps
    WHERE ps.provider_id = p_provider_id
      AND ps.user_profile_id = current_app_user_id()
      AND ps.status = 'active'
  )
$$;

GRANT EXECUTE ON FUNCTION public.app_is_active_staff_of(integer) TO pawpi_app;

ALTER TABLE public.pet_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_medical_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pet_medical_profiles_owner_all ON public.pet_medical_profiles;
CREATE POLICY pet_medical_profiles_owner_all ON public.pet_medical_profiles
  FOR ALL
  USING (owner_user_id = current_app_user_id())
  WITH CHECK (owner_user_id = current_app_user_id());
DROP POLICY IF EXISTS pet_medical_profiles_provider_read ON public.pet_medical_profiles;
CREATE POLICY pet_medical_profiles_provider_read ON public.pet_medical_profiles
  FOR SELECT
  USING (app_provider_has_grant(pet_id, 'medical_read'));

ALTER TABLE public.vet_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vet_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vet_notes_owner_all ON public.vet_notes;
CREATE POLICY vet_notes_owner_all ON public.vet_notes
  FOR ALL
  USING (owner_user_id = current_app_user_id())
  WITH CHECK (owner_user_id = current_app_user_id());
DROP POLICY IF EXISTS vet_notes_provider_read ON public.vet_notes;
CREATE POLICY vet_notes_provider_read ON public.vet_notes
  FOR SELECT
  USING (app_provider_has_grant(pet_id, 'medical_read'));
DROP POLICY IF EXISTS vet_notes_provider_insert ON public.vet_notes;
CREATE POLICY vet_notes_provider_insert ON public.vet_notes
  FOR INSERT
  WITH CHECK (app_provider_has_grant(pet_id, 'medical_write'));

ALTER TABLE public.pet_vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_vaccinations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pet_vaccinations_owner_all ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_owner_all ON public.pet_vaccinations
  FOR ALL
  USING (owner_user_id = current_app_user_id())
  WITH CHECK (owner_user_id = current_app_user_id());
DROP POLICY IF EXISTS pet_vaccinations_provider_read ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_provider_read ON public.pet_vaccinations
  FOR SELECT
  USING (app_provider_has_grant(pet_id, 'medical_read'));
DROP POLICY IF EXISTS pet_vaccinations_provider_insert ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_provider_insert ON public.pet_vaccinations
  FOR INSERT
  WITH CHECK (app_provider_has_grant(pet_id, 'vaccinations_write'));

ALTER TABLE public.vet_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vet_appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vet_appointments_owner_all ON public.vet_appointments;
CREATE POLICY vet_appointments_owner_all ON public.vet_appointments
  FOR ALL
  USING (owner_user_id = current_app_user_id())
  WITH CHECK (owner_user_id = current_app_user_id());
DROP POLICY IF EXISTS vet_appointments_provider_read ON public.vet_appointments;
CREATE POLICY vet_appointments_provider_read ON public.vet_appointments
  FOR SELECT
  USING (app_is_active_staff_of(provider_id));
DROP POLICY IF EXISTS vet_appointments_provider_update ON public.vet_appointments;
CREATE POLICY vet_appointments_provider_update ON public.vet_appointments
  FOR UPDATE
  USING (app_is_active_staff_of(provider_id));


