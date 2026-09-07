import type { OdysseyId } from '@pongapp/game-core'
import type { MangaBeat } from './Manga'

const star = (cell: number, speaker: string, line: string, caption: string): MangaBeat => ({ sheet: 'stars', cell, speaker, line, caption })
export const ODYSSEY_SCENES: Record<OdysseyId, { title: string; action: string; beats: MangaBeat[]; journal: string }> = {
  launch: { title: 'Three hearts. One stolen ship.', action: 'Lift into the sky', beats: [
    star(0, 'MARA', 'Our sun is dying. We cannot stay.', 'The five rescued crews reached shelter. Above the harbor, the fleet has abandoned its sky docks.'),
    star(0, 'MARA', 'I’ve flown her sister ships. Hold tight.', 'Mara takes a royal survey ship. Finn asks for weapons. Luma asks for wings. Mara gives her daughter the silver shields.'),
    star(0, 'MARA', 'No king gets to take you from me.', 'Finn, nine, stays beside her. Luma, four, chooses when to help. First: fly up through the cloudbreak beacon.'),
  ], journal: 'The sea crossing carried them to a sky dock the fleet had fled. Mara had flown royal survey vessels before. She stole one to save her children, carrying the old brass watch and the choices they had made at sea. Finn wanted weapons. Luma wanted wings. Mara gave her daughter the shields and promised her son that no king would take him for a battle.' },
  flare: { title: 'The last heartbeat of home', action: 'Keep the recording · enter space', beats: [
    star(0, 'FINN', 'Are those the last lights?', 'The ship rises above the clouds. Behind them, every beacon gives its final report.'),
    star(1, 'MARA', 'Record it. All of it.', 'The survey ship catches their sun’s final pulse. Mara saves it before the sky goes dark.'),
    star(1, 'MARA', 'One gate. Beyond the charts.', 'Reach the ring of blackened moons. Steer between the wrecks. Luma may lend her silver wings when danger gets close.'),
  ], journal: 'The jump lanes fractured behind them. Finn watched the last beacons go quiet. Mara kept a recording of the sun’s last pulse—not because she knew what it would open, but because it was theirs. A forbidden gate waited beyond the charts.' },
  gate: { title: 'Identify your star', action: 'Send the sun’s last heartbeat', beats: [
    star(1, 'THE GATE', 'NO LIVING SOURCE.', 'Mara transmits their sun’s coordinates. The ancient gate will not open for a star that has gone dark.'),
    star(1, 'FINN', 'Does it know we’re here?', 'Red lightning closes behind them. Luma hides her face. Mara dims the glass.'),
    star(1, 'MARA', 'Then let it hear where we began.', 'The recording still holds the pulse from takeoff. Send the heartbeat to open the forbidden gate.'),
  ], journal: 'The gate wore a thousand wrecks. It demanded a living star; the coordinates could no longer answer. Finn asked whether it knew they were there. Mara found the recorded pulse from takeoff and sent their sun’s last heartbeat. Black moons rolled backward. A blue horizon opened. They crossed as lightning fused the wreckage behind them.' },
  dragon: { title: 'Five little lights', action: 'Let Luma answer', beats: [
    star(2, 'FINN', 'The ocean goes over our heads!', 'Inside a hollow sphere, forests and seas curve around a captive sun. Every old chart says this place is dead.'),
    star(3, 'MARA', 'Easy. We don’t know it yet.', 'Something vast eclipses the sun: six wings of living gold. It circles the ship, then folds its wings.'),
    star(3, 'LUMA · 4', 'I can do that.', 'She presses her palm to the glass. Five colors answer. One by one, she curls her fingers. Its lights follow hers.'),
  ], journal: 'The dead world was alive with a billion voices. Oceans climbed the inner shell of an immense sphere. A six-winged golden creature circled them. Mara raised the shields, but Luma pressed her palm against the glass. Five lights answered her fingers. They had no common words. For a moment, they had a game.' },
  unwritten: { title: 'Let’s find out.', action: 'Keep this new beginning', beats: [
    star(3, 'FINN', 'Is that a dragon?', 'Six golden wings sweep wide. The creature has led them to a quiet shore.'),
    star(2, 'MARA', 'Let’s find out.', 'Strange flags. Unfamiliar voices. A thousand turning continents. So much left to learn.'),
    star(2, 'MARA', 'Tomorrow can find me next to you.', 'Three hearts aboard. No promise that the next sea will be easy. A promise that they will face it together.'),
  ], journal: 'They followed the golden wings to shelter, not to an ending. There were strange flags over every port and languages they would have to learn. Finn asked whether it was a dragon. Mara turned to follow. “Let’s find out.”' },
}
