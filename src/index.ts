import { Command } from 'commander'
import { walletCommand } from './commands/wallet.js'
import { chainCommand } from './commands/chain.js'
import { ecoCommand } from './commands/eco.js'
import { agentpayCommand } from './commands/agentpay.js'
import { setJsonMode } from './lib/utils/output.js'

const program = new Command()

program
  .name('morph-agent')
  .description('Morph L2 CLI — chain operations for AI agents and developers')
  .version('0.1.0')
  .option('--json', 'Output in JSON format')
  .hook('preAction', () => {
    if (program.opts().json) {
      setJsonMode(true)
    }
  })

// L1 — Wallet
program.addCommand(walletCommand())

// L2 — On-chain: RPC / Explorer / Alt-Fee / EIP-7702
program.addCommand(chainCommand())

// L3 — Ecosystem: DEX Swap
program.addCommand(ecoCommand())

// L4 — Agent Payment: x402
program.addCommand(agentpayCommand())

program.parse()
