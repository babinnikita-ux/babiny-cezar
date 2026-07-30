# Repository test-environment notes

- Launch the built cezar server through `.ai/scripts/test-env-up.sh`; its app process must use `nohup` with stdin detached so it survives non-interactive bootstrap shells. This prevents a descriptor from reporting a server that is terminated as soon as the bootstrap command exits.
- The current workspace build emits the runnable service at `packages/cezar/dist/index.js` and the cockpit at `packages/cezar/web/dist/index.html`; `packages/api-client` is typechecked but emits no `dist/index.js`, while the service postbuild inlines `packages/contract`. Keep the entrypoint artifact gate aligned with those two produced files.
