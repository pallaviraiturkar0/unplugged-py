# unplugged.py

Python logic puzzles for developers who miss coding before AI.

Each refresh gives you one small puzzle. Write the function yourself and press **RUN** to check it against tests. There is no AI and no autocomplete, only an optional hint.

**Play:** https://pallaviraiturkar0.github.io/unplugged-py/

## How it works

- The site is static and has no backend. Python runs in your browser with [Pyodide](https://pyodide.org), in a Web Worker.
- A run stops after 5 seconds, so an infinite loop can't freeze the page.
- Your streak and solved puzzles are saved in your browser's `localStorage`.
- If you skip a puzzle without solving it, your streak resets.

## Add a puzzle

Add an object to `puzzles.json`:

```json
{
  "id": "unique-id",
  "title": "Fun Title",
  "level": 1,
  "fn": "function_name",
  "prompt": "What to do.",
  "hint": "A nudge, not the answer.",
  "starter": "def function_name(x):\n    # your code here\n    pass\n",
  "cases": [[[1], 2], [[5], 6]]
}
```

`level` is 1 (easy) or 2 (medium). Keep puzzles short and give them a small story. Each item in `cases` is `[args, expected]`. Values are compared as JSON, so `1` and `True` are different.

## Run locally

```sh
python3 -m http.server
```

Then open http://localhost:8000.
