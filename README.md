This is a [Next.js](https://nextjs.org) app with a local Python API for an agent-based brick simulation.

## Local workflow

The current setup is local-first:

- Python remains the source of truth for the brick-generation algorithm.
- The Next.js app provides the button, controls, and Three.js preview.
- The Python API returns brick-instance JSON for fast browser rendering.
- The Python API can save JSON and `.scad` exports into `backend/exports/`.

## Install dependencies

### Frontend

From the repository root:

```bash
npm install
```

### Python backend

Create a virtual environment and install the backend packages:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

## Run the local app

Start the Python API in one terminal:

```bash
npm run dev:python
```

That serves the generator at [http://127.0.0.1:8000](http://127.0.0.1:8000).

Start the Next.js app in a second terminal:

```bash
npm run dev
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

`npm run dev` uses `next dev --webpack` for local stability.

If you are mostly iterating on the Python model and want the least fragile frontend option, use:

```bash
npm run preview
```

That runs a production-style frontend without file watching.

## What the app does now

When you click **Generate model** in the UI:

1. The React app sends generation settings to the local Python API.
2. The Python service runs the brick model from `backend/Brick_Builder_1.py`.
3. The service returns structured JSON describing each brick:
   - `id`
   - `position`
   - `size`
   - `color`
4. The browser renders those bricks in a Three.js preview.
5. The Python service writes exports into `backend/exports/` and exposes download links for saved artifacts.

## Python files

### `backend/api.py`

Runs the local FastAPI service used by the frontend.

Current endpoints:

- `GET /health`
- `POST /generate`
- `GET /exports/{file_name}`

### `backend/simulation/brick_agent.py`

Defines the Mesa agent that stores each brick's position, size, and color.

### `backend/simulation/brick_model.py`

Runs the brick-placement simulation and supports:

- returning structured brick JSON for the web preview
- writing JSON exports
- writing OpenSCAD exports when requested

Running it directly still works:

```bash
python backend/Brick_Builder_1.py
```

By default it writes:

- `backend/exports/sample.json`
- `backend/exports/sample.scad`

### `backend/simulation/scad_export.py`

Contains the OpenSCAD export helper used by the simulation.

### `backend/exports/`

Stores generated artifacts:

- JSON exports for debugging or manual inspection
- SCAD exports for OpenSCAD

## Notes

- `backend/exports/sample.scad` is an OpenSCAD source file, not JSON or CSV.
- The live Three.js preview does not parse `.scad`; it uses the JSON brick data returned by Python.
- If you want the frontend to call a different Python host later, set `NEXT_PUBLIC_BRICK_API_URL` in `.env.local`.
- The Python API now builds download URLs from the incoming request, so the same frontend contract can move from local to remote hosting more easily.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
