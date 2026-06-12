// ── CLI ASCII Banner ──
import pc from 'picocolors'

export function showBanner(): void {
  console.log('')
  console.log(
    `  ${pc.cyan('╭────────────────────────────────╮')}`,
  )
  console.log(
    `  ${pc.cyan('│')}    ${pc.green('mp-skills')}                    ${pc.cyan('│')}`,
  )
  console.log(
    `  ${pc.cyan('│')}  ${pc.dim('miniprogram ai skills toolkit')}  ${pc.cyan('│')}`,
  )
  console.log(
    `  ${pc.cyan('╰────────────────────────────────╯')}`,
  )
  console.log('')
}
