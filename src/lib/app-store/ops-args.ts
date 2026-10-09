export type OpsArgs = { cmd: string; arg: string; apply: boolean };

/**
 * Command line of scripts/asc-release-ops.ts: `command [arg] [--apply]`.
 *
 * The workflow always sends exactly three tokens ("$COMMAND" "$ARG" "$APPLY_FLAG"), empty ones included, so
 * the free-text argument is always the second token. A shell-level `--apply` is only honoured in the last
 * slot (or as the second token of a two-token local call), and the argument itself may not start with "-"
 * and is limited to letters, digits and underscores. A dispatcher can therefore never switch on a write
 * through the argument input; only the dedicated apply input can.
 */
export function parseOpsArgs(argv: string[]): OpsArgs {
  const [cmd, second, third, ...rest] = argv;
  if (!cmd) throw new Error("Missing command.");
  if (rest.length > 0) throw new Error("Unexpected extra arguments.");

  let arg = "";
  let apply = false;
  if (argv.length === 2 && second === "--apply") {
    apply = true;
  } else {
    arg = second ?? "";
    if (third !== undefined && third !== "" && third !== "--apply") {
      throw new Error("Unexpected argument; only --apply may follow.");
    }
    apply = third === "--apply";
  }
  if (arg.startsWith("-")) throw new Error("The argument must not start with -.");
  if (!/^[A-Za-z0-9_]*$/.test(arg)) {
    throw new Error("The argument may contain only letters, digits and underscores.");
  }
  return { cmd, arg, apply };
}
