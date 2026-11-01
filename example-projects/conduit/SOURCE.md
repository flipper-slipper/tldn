# Source

Two RealWorld ("Conduit") implementations combined into one example system, without their git history:

- frontend/: https://github.com/gothinkster/react-redux-realworld-example-app at commit ee72eba (2021-09-07). Licence: MIT (frontend/LICENSE.md).
- backend/: https://github.com/gothinkster/node-express-realworld-example-app at commit 30b68e1 (2024-01-04). Licence: MIT, as declared in backend/package.json (the repo has no LICENSE file).

Both follow the RealWorld API spec, so either works with the other. Treat this example as one system: the frontend calls this backend. (In the code, `API_ROOT` in frontend/src/agent.js points at the public demo server, conduit.productionready.io; running locally you would point it at this backend.) Unchanged except for this file.
Reference model: ../references/conduit.yaml
