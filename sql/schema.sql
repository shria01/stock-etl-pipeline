--
-- PostgreSQL database dump
--

\restrict DwzmibUc2yVt2ewAaWF0JZzHlF5IZAQVQT521HVEtZWPRKdyFOAQawfYiIgabme

-- Dumped from database version 15.18 (Debian 15.18-1.pgdg13+1)
-- Dumped by pg_dump version 15.18 (Debian 15.18-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: drop_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drop_events (
    id integer NOT NULL,
    ticker character varying(10) NOT NULL,
    drop_quarter date NOT NULL,
    baseline_price numeric(12,4),
    trough_price numeric(12,4),
    drop_pct numeric(12,4),
    volatility_90d numeric(12,4),
    market_cap bigint,
    recovered_date date,
    days_to_recovery integer,
    recovered_within_1yr boolean,
    max_drawdown_pct numeric(12,4)
);


--
-- Name: drop_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drop_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drop_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drop_events_id_seq OWNED BY public.drop_events.id;


--
-- Name: etl_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_runs (
    id integer NOT NULL,
    ticker character varying(10),
    status character varying(20),
    rows_loaded integer,
    error_msg text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT etl_runs_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'failed'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: etl_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etl_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etl_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.etl_runs_id_seq OWNED BY public.etl_runs.id;


--
-- Name: moving_averages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moving_averages (
    id integer NOT NULL,
    ticker character varying(10) NOT NULL,
    calc_date date NOT NULL,
    ma_7 numeric(12,4),
    ma_30 numeric(12,4),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: moving_averages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.moving_averages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: moving_averages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.moving_averages_id_seq OWNED BY public.moving_averages.id;


--
-- Name: quarterly_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quarterly_returns (
    id integer NOT NULL,
    ticker character varying(10) NOT NULL,
    quarter date NOT NULL,
    start_price numeric(12,4),
    end_price numeric(12,4),
    quarterly_return numeric(8,4)
);


--
-- Name: quarterly_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quarterly_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quarterly_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quarterly_returns_id_seq OWNED BY public.quarterly_returns.id;


--
-- Name: stock_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_prices (
    id integer NOT NULL,
    ticker character varying(10) NOT NULL,
    price_date date NOT NULL,
    open numeric(12,4),
    high numeric(12,4),
    low numeric(12,4),
    close numeric(12,4),
    volume bigint,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_prices_id_seq OWNED BY public.stock_prices.id;


--
-- Name: symbols; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symbols (
    id integer NOT NULL,
    ticker character varying(10) NOT NULL,
    company character varying(255),
    sector character varying(100),
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: symbols_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.symbols_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: symbols_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.symbols_id_seq OWNED BY public.symbols.id;


--
-- Name: drop_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events ALTER COLUMN id SET DEFAULT nextval('public.drop_events_id_seq'::regclass);


--
-- Name: etl_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_runs ALTER COLUMN id SET DEFAULT nextval('public.etl_runs_id_seq'::regclass);


--
-- Name: moving_averages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moving_averages ALTER COLUMN id SET DEFAULT nextval('public.moving_averages_id_seq'::regclass);


--
-- Name: quarterly_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_returns ALTER COLUMN id SET DEFAULT nextval('public.quarterly_returns_id_seq'::regclass);


--
-- Name: stock_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_prices ALTER COLUMN id SET DEFAULT nextval('public.stock_prices_id_seq'::regclass);


--
-- Name: symbols id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbols ALTER COLUMN id SET DEFAULT nextval('public.symbols_id_seq'::regclass);


--
-- Name: drop_events drop_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_pkey PRIMARY KEY (id);


--
-- Name: drop_events drop_events_ticker_drop_quarter_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_ticker_drop_quarter_key UNIQUE (ticker, drop_quarter);


--
-- Name: etl_runs etl_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_runs
    ADD CONSTRAINT etl_runs_pkey PRIMARY KEY (id);


--
-- Name: moving_averages moving_averages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moving_averages
    ADD CONSTRAINT moving_averages_pkey PRIMARY KEY (id);


--
-- Name: moving_averages moving_averages_ticker_calc_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moving_averages
    ADD CONSTRAINT moving_averages_ticker_calc_date_key UNIQUE (ticker, calc_date);


--
-- Name: quarterly_returns quarterly_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_returns
    ADD CONSTRAINT quarterly_returns_pkey PRIMARY KEY (id);


--
-- Name: quarterly_returns quarterly_returns_ticker_quarter_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_returns
    ADD CONSTRAINT quarterly_returns_ticker_quarter_key UNIQUE (ticker, quarter);


--
-- Name: stock_prices stock_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_prices
    ADD CONSTRAINT stock_prices_pkey PRIMARY KEY (id);


--
-- Name: stock_prices stock_prices_ticker_price_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_prices
    ADD CONSTRAINT stock_prices_ticker_price_date_key UNIQUE (ticker, price_date);


--
-- Name: symbols symbols_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbols
    ADD CONSTRAINT symbols_pkey PRIMARY KEY (id);


--
-- Name: symbols symbols_ticker_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbols
    ADD CONSTRAINT symbols_ticker_key UNIQUE (ticker);


--
-- Name: drop_events drop_events_ticker_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_ticker_fkey FOREIGN KEY (ticker) REFERENCES public.symbols(ticker);


--
-- Name: moving_averages moving_averages_ticker_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moving_averages
    ADD CONSTRAINT moving_averages_ticker_fkey FOREIGN KEY (ticker) REFERENCES public.symbols(ticker);


--
-- Name: quarterly_returns quarterly_returns_ticker_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_returns
    ADD CONSTRAINT quarterly_returns_ticker_fkey FOREIGN KEY (ticker) REFERENCES public.symbols(ticker);


--
-- Name: stock_prices stock_prices_ticker_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_prices
    ADD CONSTRAINT stock_prices_ticker_fkey FOREIGN KEY (ticker) REFERENCES public.symbols(ticker);


--
-- PostgreSQL database dump complete
--

\unrestrict DwzmibUc2yVt2ewAaWF0JZzHlF5IZAQVQT521HVEtZWPRKdyFOAQawfYiIgabme

