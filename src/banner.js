'use strict';

const PURPLE = '\x1b[35m';
const RESET = '\x1b[0m';

const BANNER = `${PURPLE}
 ██████╗  ██████╗ ██╗  ██╗██╗   ██╗     ██████╗██╗      ██████╗ ███╗   ██╗███████╗██████╗
 ██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝    ██╔════╝██║     ██╔═══██╗████╗  ██║██╔════╝██╔══██╗
 ██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝     ██║     ██║     ██║   ██║██╔██╗ ██║█████╗  ██████╔╝
 ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝      ██║     ██║     ██║   ██║██║╚██╗██║██╔══╝  ██╔══██╗
 ██║  ██║╚██████╔╝██╔╝ ██╗   ██║       ╚██████╗███████╗╚██████╔╝██║ ╚████║███████╗██║  ██║
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝        ╚═════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝${RESET}`;

function printBanner({ clear = true, write = (text) => process.stdout.write(text) } = {}) {
  if (clear && process.stdout.isTTY) {
    // ANSI clear instead of console.clear(), so piping logs still works.
    write('\x1b[2J\x1b[H');
  }
  write(`${BANNER}\n`);
}

module.exports = { BANNER, printBanner, PURPLE, RESET };
