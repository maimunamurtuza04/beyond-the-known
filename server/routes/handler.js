/**
 * Small wrapper so every route fails loudly in dev but returns
 * clean JSON to the browser instead of an HTML stack trace.
 */
export function handle(fn) {
  return (req, res, next) => {
    try {
      const payload = fn(req.query, req);
      res.set('Cache-Control', 'no-store');
      res.json(payload);
    } catch (error) {
      next(error);
    }
  };
}
