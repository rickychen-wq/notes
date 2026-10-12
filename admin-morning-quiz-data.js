export const MORNING_QUIZ_BANK={
  chemistry:{label:'化學',accent:'#2f6f6b',questions:[
    {u:'1-2 化學計量',q:'N₂+3H₂→2NH₃。投入 2 mol N₂ 與 3 mol H₂，最多生成多少 mol NH₃？',c:['1 mol','2 mol','3 mol','4 mol'],a:1,why:'比較 n÷係數：N₂ 為 2÷1=2，H₂ 為 3÷3=1，因此 H₂ 是限量試劑。由 3 mol H₂ 可生成 2 mol NH₃，所以答案是 2 mol。',trap:'限量試劑不能只看莫耳數誰比較少，要先除以反應係數。'},
    {u:'1-3 赫斯定律',q:'利用莫耳生成熱計算反應熱時，正確公式是哪一個？',c:['Σ反應物生成熱−Σ生成物生成熱','Σ生成物生成熱−Σ反應物生成熱','Σ反應物燃燒熱−Σ生成物生成熱','所有生成熱直接相加'],a:1,why:'生成熱路徑是先把反應物分解回元素，再由元素生成生成物，因此 ΔH反應=ΣνΔHf°(生成物)−ΣνΔHf°(反應物)。',trap:'題目若給燃燒熱，快捷式方向會反過來：反應物燃燒熱總和−生成物燃燒熱總和。'},
    {u:'1-1 離子反應',q:'AgNO₃(aq) 與 NaCl(aq) 混合，正確的淨離子反應式為何？',c:['Ag⁺+NO₃⁻→AgNO₃','Na⁺+Cl⁻→NaCl','Ag⁺+Cl⁻→AgCl(s)','AgNO₃+NaCl→AgCl+NaNO₃'],a:2,why:'AgCl 是難溶沉澱，Ag⁺與 Cl⁻ 是真正反應的離子；Na⁺、NO₃⁻前後都留在溶液中，是旁觀離子。',trap:'完整分子式不是淨離子式；強電解質要拆，沉澱不可拆。'},
    {u:'2-2 氣體定律',q:'定壓下，氣體由 27°C 加熱到 127°C，體積約變為原來幾倍？',c:['127/27 倍','400/300 倍','300/400 倍','2 倍'],a:1,why:'定壓、定量時 V/T 固定，溫度要換成絕對溫標：27°C≈300 K、127°C≈400 K，因此 V₂/V₁=400/300。',trap:'不能直接用攝氏溫度 127÷27；比例定律中的溫度必須用 K。'},
    {u:'2-3 理想氣體',q:'真實氣體在什麼條件下最接近理想氣體？',c:['低溫、高壓','低溫、低壓','高溫、高壓','高溫、低壓'],a:3,why:'高溫使粒子動能大、吸引力影響相對變小；低壓使粒子距離遠，分子體積與作用力較可忽略。',trap:'高壓會把粒子擠近，反而使真實氣體偏離理想模型。'}
  ]},
  biology:{label:'生物',accent:'#3f7a4a',questions:[
    {u:'2-1 植物組織',q:'下列哪個構造成熟時通常死亡，且具有厚而木質化的次生細胞壁？',c:['薄壁細胞','厚角細胞','厚壁細胞','伴細胞'],a:2,why:'厚壁細胞的主要功能是堅硬支持，成熟時通常死亡，具有厚且常木質化的次生壁。厚角細胞仍活著，壁是不均勻增厚的初生壁。',trap:'厚角與厚壁名稱很像，但厚角細胞活、較柔韌；厚壁細胞通常死、較堅硬。'},
    {u:'2-2 次級生長',q:'維管形成層向內與向外通常分別形成什麼？',c:['次生韌皮部；次生木質部','次生木質部；次生韌皮部','木栓層；表皮','皮層；中柱'],a:1,why:'維管形成層向內產生次生木質部，向外產生次生韌皮部。次生木質部逐年大量累積，成為主要木材。',trap:'木栓形成層才和周皮有關，不要把它與維管形成層混在一起。'},
    {u:'3-1 根部運輸',q:'卡氏帶最重要的功能是什麼？',c:['完全阻止水進入中柱','阻斷質外體路徑，迫使水與離子穿過細胞膜','把糖運入韌皮部','直接產生蒸散拉力'],a:1,why:'卡氏帶的栓質封住內皮細胞壁與細胞間隙，使水和離子不能直接沿質外體通過，必須穿越細胞膜，接受內皮細胞的選擇。',trap:'卡氏帶不是把所有水擋住，而是擋住「不經細胞膜的旁路」。'},
    {u:'3-2 光合作用',q:'光反應合成 ATP 時，真正通過 ATP 合成酶的是什麼？',c:['高能電子','H⁺','O₂','NADPH'],a:1,why:'電子傳遞鏈利用電子放出的能量建立 H⁺梯度，最後 H⁺沿梯度通過 ATP 合成酶，推動 ADP 與 Pi 合成 ATP。',trap:'電子走電子傳遞鏈；通過 ATP 合成酶的是 H⁺，這兩條路不要混在一起。'},
    {u:'3-2 循環電子流',q:'循環電子流相較於非循環電子流，正確的敘述為何？',c:['只使用 PSII 並產生 O₂','只使用 PSI，主要補充 ATP，不產 NADPH 與 O₂','同時使用 PSI、PSII 並產生葡萄糖','完全不需要電子'],a:1,why:'循環電子流只使用 PSI，電子繞回電子傳遞鏈並回到 PSI，建立 H⁺梯度製造 ATP；因不光解水、不還原 NADP⁺，所以不產 O₂與 NADPH。',trap:'「循環」的是電子的路徑，不是 ATP 循環回去。'}
  ]},
  english:{label:'英文',accent:'#3f5f9e',questions:[
    {u:'課本句型',q:'The team is capable ___ solving the problem.',c:['to','of','for','with'],a:1,why:'固定搭配是 be capable of N/V-ing。solving 是動名詞，所以填 of；capable 不接 to V。',trap:'able to V 與 capable of V-ing 意思接近，但搭配不能混用。'},
    {u:'雜誌 U2',q:'When ___ by insects, some plants release chemical signals.',c:['attack','attacking','attacked','to attack'],a:2,why:'完整句為 When some plants are attacked by insects。省略與主句相同的主詞和 be 動詞後，留下過去分詞 attacked，表示被動。',trap:'植物是「被昆蟲攻擊」，不是主動 attacking insects。'},
    {u:'課本／雜誌句型',q:'___ a tree grows, the harder it becomes for water to reach the top.',c:['Taller','The taller','The tallest','As taller'],a:1,why:'句型是 The+比較級+S+V, the+比較級+S+V，表示「越……就越……」，前後兩邊的 the 都不能少。',trap:'不要只看到後半句的 the；前面的比較級也要放 the。'},
    {u:'雜誌 U8',q:'The peasants were stripped ___ political power.',c:['from','with','of','by'],a:2,why:'固定搭配 strip A of B 表示「剝奪 A 的 B」，被動句就是 A be stripped of B。',trap:'中文雖然有「從……拿走」的感覺，但固定介系詞是 of，不是 from。'},
    {u:'4500 單',q:'eventual 與 evident 的正確區分為何？',c:['兩者都表示意外的','eventual=最後的；evident=明顯的','eventual=明顯的；evident=最後的','兩者都表示額外的'],a:1,why:'eventual 表示經過一段過程後「最終的」；evident 表示證據清楚而「明顯的」。eventually 是終於，evidently 是顯然地。',trap:'eventual 不是「事件的」；看到字形像 event 不要直接用中文拆。'}
  ]}
};
