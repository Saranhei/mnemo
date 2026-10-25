// Ejercicios de ejemplo (textos originales, nivel principiante). Sin archivo de
// audio: los lee la voz del sistema. Sirven para probar los tres modos.

export function exampleListenings() {
  return [
    {
      title: 'わたしの いちにち (mi día)',
      level: 'easy',
      language: 'ja',
      example: true,
      transcript:
        'わたしは まいにち 七時に [おきます]。あさごはんを [たべて]、だいがくに [いきます]。だいがくで にほんごを [べんきょうします]。ひるごはんは [ともだち]と たべます。うちに かえって、テレビを [みます]。十一時ごろ [ねます]。',
      reading:
        'わたしは まいにち しちじに おきます。あさごはんを たべて、だいがくに いきます。だいがくで にほんごを べんきょうします。ひるごはんは ともだちと たべます。うちに かえって、テレビを みます。じゅういちじごろ ねます。',
      note: 'Los espacios marcan verbos y una persona. Probá el dictado completo a 0,5×.',
      questions: [
        { prompt: '¿A qué hora se levanta?', answers: ['七時', 'しちじ', '7時', 'ななじ'], note: '' },
        { prompt: '¿Con quién almuerza?', answers: ['ともだち', '友だち', '友達'], note: '' },
        { prompt: '¿Qué hace al volver a casa? (en japonés)', answers: ['テレビをみます', 'テレビを見ます', 'テレビをみる', 'テレビ'], note: '' },
      ],
    },
    {
      title: '週末の旅行 (un viaje de fin de semana)',
      level: 'medium',
      language: 'ja',
      example: true,
      transcript:
        '先週の週末、友だちと京都へ行きました。土曜日の朝、新幹線に乗りました。京都でお寺を見て、写真をたくさん撮りました。天気がよくて、とても楽しかったです。日曜日は雨でしたから、ホテルでゆっくり休みました。',
      reading:
        'せんしゅうのしゅうまつ、ともだちときょうとへいきました。どようびのあさ、しんかんせんにのりました。きょうとでおてらをみて、しゃしんをたくさんとりました。てんきがよくて、とてもたのしかったです。にちようびはあめでしたから、ホテルでゆっくりやすみました。',
      note: 'Sin corchetes: la app elige los espacios según el nivel.',
      questions: [
        { prompt: '¿Adónde fue?', answers: ['京都', 'きょうと'], note: '' },
        { prompt: '¿En qué viajó?', answers: ['新幹線', 'しんかんせん'], note: '' },
        { prompt: '¿Cómo estuvo el tiempo el domingo? (en japonés)', answers: ['雨', 'あめ', '雨でした', 'あめでした'], note: '' },
      ],
    },
    {
      title: '日本の夏 (el verano en Japón)',
      level: 'hard',
      language: 'ja',
      example: true,
      transcript:
        '日本の夏はとても暑いです。七月と八月は、気温が三十五度ぐらいになる日もあります。夏休みには、たくさんの人が海や山へ行きます。お祭りもあって、ゆかたを着て花火を見る人が多いです。私は暑いのがあまり好きじゃないですが、夏のお祭りは大好きです。',
      reading:
        'にほんのなつはとてもあついです。しちがつとはちがつは、きおんがさんじゅうごどぐらいになるひもあります。なつやすみには、たくさんのひとがうみややまへいきます。おまつりもあって、ゆかたをきてはなびをみるひとがおおいです。わたしはあついのがあまりすきじゃないですが、なつのおまつりはだいすきです。',
      note: 'Nivel difícil: muchos espacios. En el dictado completo podés escribir en kana.',
      questions: [
        { prompt: '¿A cuántos grados puede llegar la temperatura?', answers: ['三十五度', 'さんじゅうごど', '35度', '35'], note: '' },
        { prompt: '¿Adónde va la gente en las vacaciones de verano?', answers: ['海や山', 'うみややま', '海と山', 'うみとやま'], note: '' },
        { prompt: '¿Qué le encanta a la persona que habla?', answers: ['夏のお祭り', 'なつのおまつり', 'お祭り', 'おまつり'], note: '' },
      ],
    },
  ];
}
