/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "pipes-7x7-lgdq81", name: "初识水管", width: 7, height: 7, difficulty: 'easy', series: "入门", board: "8ad96582c77f289e187a31f42b813faddab8a2ae481e983a4|x2xxx3xxxxx2xxxxxxx2xx0xx0xxx32xx0xx3x1xxxxxxxx2x|1220231003321002122203002023232210223212332033320", solution: "2233030132022311010231010002132330313113111201021" },
  { id: "pipes-7x7-lgdq82", name: "弯管回廊", width: 7, height: 7, difficulty: 'easy', series: "入门", board: "4ca42c155316f46d52a749fe87dea2dbd4ae9ad14a81484e6|xx2xxxx00xxx0xxx2x0xxx1xxxxx3xxxxx3xx1xxx3xxxxxxx|1120212003210001230121121332320123321101233303013", solution: "0321133001330130200202112111332211333123031021322" },
  { id: "pipes-7x7-lgdq83", name: "管网交错", width: 7, height: 7, difficulty: 'medium', series: "进阶", board: "1e2c7428f25845151fab7ef5de4259bc781566537d1c1c482|xxxxxxxx0x0xx2x2x00xxx31xxxx2xxxxxx2xx0xxxxxxxxxx|0231200101023232200312312330230133122102212301031", solution: "1023111202010222100023311013212000220200100232113" },
  { id: "pipes-7x7-lgdq84", name: "水流迷宫", width: 7, height: 7, difficulty: 'medium', series: "进阶", board: "11cbd44ce9158a4348f6a4ab35cba58df94bbbd9b221682e8|xxxxxxxxxxx0x1xxxx0x3x3xx0xx12xx3xxxxxxxxxxxxxxxx|1320002331202100110132303001123331103132102332211", solution: "2232310220003132020230312033121230210201223121020" },
  { id: "pipes-7x7-lgdq85", name: "水管之壁", width: 7, height: 7, difficulty: 'hard', series: "挑战", board: "8aabaa92d7f8183953af9e342b655e64c9b517d62a81c4321|x02x00xxxx1xxxxx2x00xxxxxxx20xxxxxx2xxxxx3xxxxxxx|0020000122120202210001303332003033221223132203111", solution: "2022003031102110200033220222031312320031331112020" },
  { id: "pipes-7x7-lgdq86", name: "终局水管", width: 7, height: 7, difficulty: 'hard', series: "挑战", board: "c55ab51de86fd85cc15a8dce88b755ec25a555de1a124818c|x310x1xxxxx0xx2xxx23xxxxxxxx00xxx01000xxx3xxxxxxx|0310010033201120332310211031002100100013132010313", solution: "3310213200003022002332030112003010100021030321021" },
]
