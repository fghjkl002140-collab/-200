import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Activity, Star, ExternalLink } from 'lucide-react';
import './animations.css'
import { supabase } from './supabase';

type Goal = '筋肥大' | 'ダイエット' | '健康維持' | '';
type LactoseIntolerance = 'ある' | 'ない' | '';
type Digestion = '弱い' | '普通' | '強い' | '';
type Taste = '甘いOK' | '甘い苦手' | '';
type Priority = '低糖質' | '無添加寄り' | 'コスパ' | '';
type Texture = 'どろっと' | 'さっぱり' | '腹持ち重視' | '';
type Cooking = '使いたい' | '使わない' | '';
type ProteinType = 'WPI' | 'WPC' | 'ソイ' | 'ピー';

interface Step1Data {
  height: string;
  weight: string;
  goal: Goal;
}

interface Step2Data {
  lactoseIntolerance: LactoseIntolerance;
  digestion: Digestion;
  taste: Taste;
  priority: Priority;
  texture: Texture;
  cooking: Cooking;
}

interface Product {
  name: string;
  brand: string;
  price: string;
  rating: number;
  reviewCount: number;
  url: string;
  features: string[];
  imageUrl: string;
}

interface DiagnosisResult {
  type: ProteinType;
  reason: string;
  points: string[];
  searchKeyword: string;
  products: Product[];
}

interface RakutenItem {
  itemName: string;
  shopName: string;
  itemPrice: number;
  reviewAverage?: number;
  reviewCount?: number;
  itemUrl: string;
  mediumImageUrls?: { imageUrl: string }[];
}

interface RakutenResponse {
  Items: { Item: RakutenItem }[];
}

function App() {
  const [step, setStep] = useState(1);
  const [subStep, setSubStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data>({
    height: '',
    weight: '',
    goal: '',
  });
  const [step2Data, setStep2Data] = useState<Step2Data>({
    lactoseIntolerance: '',
    digestion: '',
    taste: '',
    priority: '',
    texture: '',
    cooking: '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [proteinAmount, setProteinAmount] = useState(0);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingRakuten, setIsLoadingRakuten] = useState(false);
  const [rakutenError, setRakutenError] = useState<string | null>(null);

  useEffect(() => {
    initializeUser();
    loadLastMeasurement();
  }, []);

  const initializeUser = async () => {
    let storedUserId = localStorage.getItem('proteinDiagnosisUserId');
    if (!storedUserId) {
      storedUserId = crypto.randomUUID();
      localStorage.setItem('proteinDiagnosisUserId', storedUserId);
    }
    setUserId(storedUserId);
  };

  const loadLastMeasurement = async () => {
    const storedUserId = localStorage.getItem('proteinDiagnosisUserId');
    if (!storedUserId) return;

    const { data } = await supabase
      .from('user_measurements')
      .select('weight, height')
      .eq('user_id', storedUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setStep1Data(prev => ({
        ...prev,
        height: data.height.toString(),
        weight: data.weight.toString(),
      }));
    }
  };

  const saveMeasurement = async (height: number, weight: number) => {
    if (!userId) return;

    await supabase
      .from('user_measurements')
      .insert({
        user_id: userId,
        height,
        weight,
      });
  };

  const validateStep1 = (): boolean => {
    const newErrors: string[] = [];
    const height = parseFloat(step1Data.height);
    const weight = parseFloat(step1Data.weight);

    if (!step1Data.height) newErrors.push('身長を入力してください');
    else if (height < 120 || height > 210) newErrors.push('身長は120〜210の範囲で入力してください');

    if (!step1Data.weight) newErrors.push('体重を入力してください');
    else if (weight < 30 || weight > 150) newErrors.push('体重は30〜150の範囲で入力してください');

    if (!step1Data.goal) newErrors.push('目的を選択してください');

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateCurrentSubStep = (): boolean => {
    const newErrors: string[] = [];

    if (subStep === 1 && !step2Data.lactoseIntolerance) {
      newErrors.push('選択してください');
    } else if (subStep === 2 && !step2Data.digestion) {
      newErrors.push('選択してください');
    } else if (subStep === 3 && !step2Data.taste) {
      newErrors.push('選択してください');
    } else if (subStep === 4 && !step2Data.priority) {
      newErrors.push('選択してください');
    } else if (subStep === 5 && !step2Data.texture) {
      newErrors.push('選択してください');
    } else if (subStep === 6 && !step2Data.cooking) {
      newErrors.push('選択してください');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const calculateProtein = () => {
    const height = parseFloat(step1Data.height);
    const weight = parseFloat(step1Data.weight);
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);

    let coefficient = 1.1;
    if (step1Data.goal === '筋肥大') coefficient = 2.0;
    else if (step1Data.goal === 'ダイエット') coefficient = 1.8;
    else if (step1Data.goal === '健康維持') coefficient = 1.1;

    if (bmi < 18.5) coefficient += 0.2;
    else if (bmi >= 25 && bmi < 30) coefficient -= 0.1;
    else if (bmi >= 30) coefficient -= 0.2;

    const amount = Math.round(weight * coefficient);
    setProteinAmount(amount);
  };

  const fetchRakutenProducts = async (keyword: string): Promise<Product[]> => {
    const appId = import.meta.env.VITE_RAKUTEN_APPLICATION_ID;
    const affiliateId = import.meta.env.VITE_RAKUTEN_AFFILIATE_ID;
    if (!appId) {
      throw new Error('楽天APIキーが設定されていません。');
    }

    const params = new URLSearchParams({
      format: 'json',
      applicationId: appId,
      keyword,
      hits: '10',
      sort: '-reviewAverage',
    });

    if (affiliateId) {
      params.set('affiliateId', affiliateId);
    }

    const response = await fetch(
      `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error('楽天APIの呼び出しに失敗しました。');
    }

    const data = (await response.json()) as RakutenResponse;

    return data.Items.map(({ Item }) => ({
      name: Item.itemName,
      brand: Item.shopName,
      price: `¥${Item.itemPrice.toLocaleString()}`,
      rating: Item.reviewAverage ? Number(Item.reviewAverage) : 0,
      reviewCount: Item.reviewCount ?? 0,
      url: Item.itemUrl,
      imageUrl:
        Item.mediumImageUrls && Item.mediumImageUrls.length > 0
          ? Item.mediumImageUrls[0].imageUrl.replace('?_ex=128x128', '')
          : 'https://images.pexels.com/photos/4058340/pexels-photo-4058340.jpeg?auto=compress&cs=tinysrgb&w=400',
      features: [],
    }));
  };

  const performDiagnosis = async () => {
    let type: ProteinType = 'WPC';
    let reason = '';
    const points: string[] = [];

    if (step2Data.lactoseIntolerance === 'ある') {
      if (step2Data.priority === '低糖質' || step2Data.priority === '無添加寄り') {
        type = 'ソイ';
        reason = '乳糖不耐症があり、植物性で体に優しいソイプロテインがおすすめです。';
      } else {
        type = 'WPI';
        reason = '乳糖不耐症がある方には、乳糖をほぼ除去したWPIが最適です。';
      }
    } else if (step2Data.digestion === '弱い') {
      if (step2Data.priority === '無添加寄り') {
        type = 'ソイ';
        reason = '胃腸が弱い方には、消化吸収がゆっくりで体に優しいソイプロテインがおすすめです。';
      } else if (step2Data.priority === 'コスパ') {
        type = 'ピー';
        reason = '胃腸が弱い方には、アレルゲンが少なく消化しやすいピープロテインがおすすめです。';
      } else {
        type = 'WPI';
        reason = '胃腸が弱い方には、純度が高く消化しやすいWPIがおすすめです。';
      }
    } else if (step2Data.priority === 'コスパ') {
      type = 'WPC';
      reason = 'コスパ重視の方には、価格と品質のバランスが良いWPCがおすすめです。';
    } else if (step2Data.priority === '無添加寄り') {
      type = 'ソイ';
      reason = '無添加志向の方には、植物性で自然派のソイプロテインがおすすめです。';
    } else if (step2Data.priority === '低糖質') {
      type = 'WPI';
      reason = '低糖質にこだわる方には、糖質・脂質が最も少ないWPIがおすすめです。';
    } else {
      type = 'WPC';
      reason = 'バランスの取れたWPCがおすすめです。';
    }

    if (step2Data.texture === 'さっぱり') {
      reason += 'さっぱりとした口当たりを重視しました。';
    } else if (step2Data.texture === 'どろっと') {
      reason += '濃厚な飲みごたえを重視しました。';
    } else if (step2Data.texture === '腹持ち重視') {
      reason += '満腹感が持続するタイプを重視しました。';
    }

    switch (type) {
      case 'WPI':
        points.push('1食あたりタンパク質：25〜30g（高含有）');
        points.push('糖質：0.5〜1g（超低糖質）');
        points.push('脂質：0.5〜1g（超低脂質）');
        points.push(step2Data.taste === '甘い苦手' ? '甘味料：プレーン・無糖タイプを選択' : '甘味料：お好みで選択可能');
        if (step2Data.cooking === '使いたい') {
          points.push('お菓子作り：溶けやすく製菓に適している');
        }
        break;
      case 'WPC':
        points.push('1食あたりタンパク質：20〜25g');
        points.push('糖質：2〜4g');
        points.push('脂質：1〜3g');
        points.push(step2Data.taste === '甘い苦手' ? '甘味料：プレーン・無糖タイプを選択' : '甘味料：フレーバー豊富');
        if (step2Data.cooking === '使いたい') {
          points.push('お菓子作り：プロテインパンケーキなどに最適');
        }
        break;
      case 'ソイ':
        points.push('1食あたりタンパク質：20〜25g（植物性）');
        points.push('糖質：1〜3g');
        points.push('脂質：1〜2g');
        points.push(step2Data.taste === '甘い苦手' ? '甘味料：無糖・プレーンを推奨' : '甘味料：ナチュラルな風味');
        if (step2Data.cooking === '使いたい') {
          points.push('お菓子作り：ヘルシースイーツ作りに向いている');
        }
        break;
      case 'ピー':
        points.push('1食あたりタンパク質：20〜24g（植物性）');
        points.push('糖質：1〜2g');
        points.push('脂質：2〜3g');
        points.push(step2Data.taste === '甘い苦手' ? '甘味料：無糖タイプを選択' : '甘味料：自然な豆の風味');
        if (step2Data.cooking === '使いたい') {
          points.push('お菓子作り：クッキーやマフィンに使える');
        }
        break;
    }

    const keywords: Record<ProteinType, string> = {
      WPI: 'ホエイプロテイン WPI 低糖質',
      WPC: 'ホエイプロテイン WPC コスパ',
      ソイ: 'ソイプロテイン 無糖',
      ピー: 'ピープロテイン',
    };

    const searchKeyword = keywords[type];

    setIsLoadingRakuten(true);
    setRakutenError(null);

    try {
      const products = await fetchRakutenProducts(searchKeyword);

      setDiagnosis({
        type,
        reason,
        points,
        searchKeyword,
        products,
      });
    } catch (error) {
      console.error(error);
      setRakutenError('楽天の商品情報の取得に失敗しました。時間をおいて再度お試しください。');
      setDiagnosis({
        type,
        reason,
        points,
        searchKeyword,
        products: [],
      });
    } finally {
      setIsLoadingRakuten(false);
    }
  };

  const handleStep1Next = async () => {
    if (validateStep1()) {
      calculateProtein();
      const height = parseFloat(step1Data.height);
      const weight = parseFloat(step1Data.weight);
      await saveMeasurement(height, weight);
      setStep(2);
      setSubStep(1);
      setErrors([]);
    }
  };

  const handleSubStepAnswer = (field: keyof Step2Data, value: string) => {
    setStep2Data({ ...step2Data, [field]: value });
    setErrors([]);

    if (subStep < 6) {
      setTimeout(() => {
        setSubStep(subStep + 1);
      }, 300);
    } else {
      setTimeout(async () => {
        await performDiagnosis();
        setStep(3);
      }, 300);
    }
  };

  const handleRakutenSearch = () => {
    if (diagnosis) {
      const url = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(diagnosis.searchKeyword)}/`;
      window.open(url, '_blank');
    }
  };

  const handleBack = () => {
    if (step === 2 && subStep > 1) {
      setSubStep(subStep - 1);
      setErrors([]);
    } else {
      setStep(step - 1);
      setErrors([]);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSubStep(1);
    setStep1Data(prev => ({ ...prev, goal: '' }));
    setStep2Data({ lactoseIntolerance: '', digestion: '', taste: '', priority: '', texture: '', cooking: '' });
    setErrors([]);
    setProteinAmount(0);
    setDiagnosis(null);
    setRakutenError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">プロテイン診断</h1>
          </div>
          <p className="text-gray-600 text-sm">あなたに最適なプロテインを見つけよう</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map((num) => (
            <div key={num} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step === num
                    ? 'bg-blue-600 text-white scale-110'
                    : step > num
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {num}
              </div>
              {num < 3 && (
                <div
                  className={`w-8 h-1 ${
                    step > num ? 'bg-green-500' : 'bg-gray-200'
                  } transition-all`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">基本情報を入力</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    身長 (cm)
                  </label>
                  <input
                    type="number"
                    value={step1Data.height}
                    onChange={(e) =>
                      setStep1Data({ ...step1Data, height: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="例: 170"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    体重 (kg)
                  </label>
                  <input
                    type="number"
                    value={step1Data.weight}
                    onChange={(e) =>
                      setStep1Data({ ...step1Data, weight: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="例: 65"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    目的
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {(['筋肥大', 'ダイエット', '健康維持'] as Goal[]).map((goal) => (
                      <button
                        key={goal}
                        onClick={() => setStep1Data({ ...step1Data, goal })}
                        className={`py-3 px-4 rounded-lg font-medium transition-all ${
                          step1Data.goal === goal
                            ? 'bg-blue-600 text-white shadow-md scale-105'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {goal}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500">質問 {subStep} / 6</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <div
                        key={num}
                        className={`w-2 h-2 rounded-full transition-all ${
                          num <= subStep ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">
                    推奨タンパク質量: <span className="font-bold text-blue-600">{proteinAmount}g/日</span>
                  </p>
                </div>
              </div>

              {/* Question 1 */}
              {subStep === 1 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    乳糖不耐症はありますか?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    牛乳を飲むとお腹がゴロゴロする方は「ある」を選択
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['ある', 'ない'] as LactoseIntolerance[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('lactoseIntolerance', option)}
                        className="py-4 px-4 rounded-xl font-medium transition-all bg-gradient-to-br from-blue-50 to-blue-100 text-gray-800 hover:from-blue-100 hover:to-blue-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question 2 */}
              {subStep === 2 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    胃腸の状態は?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    普段の消化の調子を教えてください
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {(['弱い', '普通', '強い'] as Digestion[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('digestion', option)}
                        className="py-4 px-2 rounded-xl font-medium text-sm transition-all bg-gradient-to-br from-green-50 to-green-100 text-gray-800 hover:from-green-100 hover:to-green-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question 3 */}
              {subStep === 3 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    甘い味は好きですか?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    プロテインの味の好みを教えてください
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['甘いOK', '甘い苦手'] as Taste[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('taste', option)}
                        className="py-4 px-4 rounded-xl font-medium transition-all bg-gradient-to-br from-purple-50 to-purple-100 text-gray-800 hover:from-purple-100 hover:to-purple-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question 4 */}
              {subStep === 4 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    何を重視しますか?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    あなたのこだわりを教えてください
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {(['低糖質', '無添加寄り', 'コスパ'] as Priority[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('priority', option)}
                        className="py-4 px-2 rounded-xl font-medium text-sm transition-all bg-gradient-to-br from-orange-50 to-orange-100 text-gray-800 hover:from-orange-100 hover:to-orange-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question 5 */}
              {subStep === 5 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    好みの口当たりは?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    プロテインの飲みごたえを選択
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {(['どろっと', 'さっぱり', '腹持ち重視'] as Texture[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('texture', option)}
                        className="py-4 px-2 rounded-xl font-medium text-sm transition-all bg-gradient-to-br from-teal-50 to-teal-100 text-gray-800 hover:from-teal-100 hover:to-teal-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question 6 */}
              {subStep === 6 && (
                <div className="animate-fadeIn">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">
                    お菓子作りに使いたい?
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    プロテインパンケーキやクッキーなど
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['使いたい', '使わない'] as Cooking[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSubStepAnswer('cooking', option)}
                        className="py-4 px-4 rounded-xl font-medium transition-all bg-gradient-to-br from-pink-50 to-pink-100 text-gray-800 hover:from-pink-100 hover:to-pink-200 hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 - Results */}
          {step === 3 && diagnosis && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">診断結果</h2>

              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 mb-5">
                <p className="text-xs text-gray-600 mb-1">あなたにおすすめのタイプ</p>
                <p className="text-2xl font-bold text-blue-600 mb-2">{diagnosis.type}</p>
                <p className="text-xs text-gray-700 leading-relaxed">{diagnosis.reason}</p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-700 mb-1">
                  <span className="font-bold">1日の推奨タンパク質量:</span>{' '}
                  <span className="text-blue-600 font-bold">{proteinAmount}g</span>
                </p>
                <p className="text-xs text-gray-600">1食あたり目安: 20〜30g</p>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  おすすめ商品（高評価順）
                </h3>
                {isLoadingRakuten && (
                  <div className="text-sm text-gray-600 mb-3">
                    楽天の商品情報を取得しています...
                  </div>
                )}
                {rakutenError && (
                  <div className="mb-3 bg-red-50 border-2 border-red-200 rounded-lg p-3 text-xs text-red-700">
                    {rakutenError}
                  </div>
                )}
                {!isLoadingRakuten && diagnosis.products.length === 0 && !rakutenError && (
                  <p className="text-sm text-gray-500">
                    条件に合う商品が見つかりませんでした。キーワード「{diagnosis.searchKeyword}」で楽天市場を検索してみてください。
                  </p>
                )}
                <div className="space-y-4">
                  {diagnosis.products.map((product, index) => (
                    <div
                      key={index}
                      className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-md transition-all"
                    >
                      <div className="flex gap-4 mb-3">
                        <div className="w-28 h-28 flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden border border-gray-200">
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">{product.brand}</p>
                          <h4 className="font-bold text-gray-800 text-sm mb-2 leading-tight">
                            {product.name}
                          </h4>
                          <p className="font-bold text-blue-600 text-lg">{product.price}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold text-sm">
                            {product.rating.toFixed(1)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {product.reviewCount.toLocaleString()}件のレビュー
                        </span>
                      </div>

                      {product.features.length > 0 && (
                        <div className="mb-3">
                          <div className="flex flex-wrap gap-1.5">
                            {product.features.map((feature, idx) => (
                              <span
                                key={idx}
                                className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => window.open(product.url, '_blank')}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
                      >
                        楽天で見る
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleReset}
                className="w-full bg-gray-100 text-gray-700 font-medium py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
              >
                最初からやり直す
              </button>
            </div>
          )}

          {/* Error Messages */}
          {errors.length > 0 && (
            <div className="mt-4 bg-red-50 border-2 border-red-200 rounded-lg p-4">
              {errors.map((error, index) => (
                <p key={index} className="text-sm text-red-700">
                  • {error}
                </p>
              ))}
            </div>
          )}

          {/* Navigation Buttons */}
          {step === 1 && (
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleStep1Next}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                次へ
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6">
              <button
                onClick={handleBack}
                className="w-full bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                戻る
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500">
          あなたに最適なプロテインで健康的な体づくりをサポート
        </p>
      </div>
    </div>
  );
}

export default App;
