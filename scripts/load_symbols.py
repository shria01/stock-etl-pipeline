import logging
from extract.sp500_list import get_sp500_symbols
from load.postgres import get_engine, upsert_symbols

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

def main():
    df = get_sp500_symbols()
    engine = get_engine()
    rows = upsert_symbols(engine, df)
    print(f"Loaded {rows} symbols into the database")


if __name__ == "__main__":
    main()
