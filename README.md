# pgfeaturediff

**Live at**: [www.pgfeaturediff.com](https://www.pgfeaturediff.com)

Compare PostgreSQL versions to see which features were added, changed, or deprecated between releases.

---

## What is this?

An interactive comparison tool built on top of the [official PostgreSQL Feature Matrix](https://www.postgresql.org/about/featurematrix/) maintained by the PostgreSQL community. Select any two PostgreSQL versions and instantly see the differences.

Data is automatically refreshed weekly (every Monday at 6:00 AM UTC) via GitHub Actions to stay in sync with the official Feature Matrix.

---

## How it works

1. **Scraper**: Python script fetches data from the [PostgreSQL Feature Matrix](https://www.postgresql.org/about/featurematrix/) page
2. **Validation**: Ensures data quality before committing changes
3. **Deployment**: Static React app hosted on GitHub Pages

All data comes directly from the PostgreSQL community's official Feature Matrix. This tool simply provides a different view of that same data.

---

## Acknowledgments

**All credit goes to the PostgreSQL community** for maintaining the comprehensive [Feature Matrix](https://www.postgresql.org/about/featurematrix/) that makes this tool possible.

Special thanks to the PostgreSQL project for creating the world's most advanced open-source database.

---

## License

MIT License - see [LICENSE](LICENSE) file for details
