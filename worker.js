importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

const HARNESS = `
import json, io, contextlib, copy, traceback
def __run(code, fn, cases_json):
    cases = json.loads(cases_json)
    out = io.StringIO()
    res = {"stdout": "", "error": None, "results": []}
    try:
        with contextlib.redirect_stdout(out):
            ns = {"__name__": "__main__"}
            exec(compile(code, "solution.py", "exec"), ns)
            f = ns.get(fn)
            if not callable(f):
                raise NameError(f"define a function called {fn}()")
            for args, exp in cases:
                try:
                    got = f(*copy.deepcopy(args))
                    try:
                        ok = json.dumps(got) == json.dumps(exp)
                        got = json.loads(json.dumps(got))
                    except (TypeError, ValueError):
                        ok, got = False, repr(got)
                    res["results"].append({"args": args, "expected": exp, "got": got, "ok": ok})
                except Exception as e:
                    res["results"].append({"args": args, "expected": exp, "got": f"{type(e).__name__}: {e}", "ok": False, "crash": True})
    except Exception as e:
        if isinstance(e, SyntaxError):
            res["error"] = "".join(traceback.format_exception_only(type(e), e)).strip()
        else:
            tb = traceback.format_exception(type(e), e, e.__traceback__)
            res["error"] = "".join(l for l in tb if "solution.py" in l or l is tb[-1]).strip()
    res["stdout"] = out.getvalue()[-2000:]
    return json.dumps(res)
`;

const ready = loadPyodide().then(async (py) => {
  await py.runPythonAsync(HARNESS);
  postMessage({ type: 'ready' });
  return py;
});

onmessage = async ({ data }) => {
  const py = await ready;
  const run = py.globals.get('__run');
  postMessage({ type: 'result', id: data.id, ...JSON.parse(run(data.code, data.fn, JSON.stringify(data.cases))) });
};
