// Seedable Mulberry32 PRNG
function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// Box-Muller transform to generate normally distributed random variables
function randomNormal(mean, stdDev, randFunc) {
    let u = 0, v = 0;
    while(u === 0) u = randFunc(); // Converting [0,1) to (0,1)
    while(v === 0) v = randFunc();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
}

// 1D Gaussian filter with boundary reflection matching SciPy
function gaussianFilter1d(arr, sigma) {
    if (sigma <= 0) return arr.slice();
    const size = Math.ceil(sigma * 3);
    const kernel = [];
    let sum = 0;
    
    // Create Gaussian kernel
    for (let i = -size; i <= size; i++) {
        const val = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel.push(val);
        sum += val;
    }
    
    // Normalize kernel
    for (let i = 0; i < kernel.length; i++) {
        kernel[i] /= sum;
    }
    
    const result = [];
    const len = arr.length;
    
    for (let i = 0; i < len; i++) {
        let weightedSum = 0;
        for (let j = -size; j <= size; j++) {
            let idx = i + j;
            // Reflect boundary conditions
            if (idx < 0) {
                idx = -idx;
            } else if (idx >= len) {
                idx = 2 * len - 2 - idx;
            }
            if (idx < 0 || idx >= len) idx = i;
            
            weightedSum += arr[idx] * kernel[j + size];
        }
        result.push(weightedSum);
    }
    return result;
}

// Global chart variables to allow updating
let priceChartObj = null;
let drawdownChartObj = null;

function runSimulation() {
    // 1. Get input values
    const n = parseInt(document.getElementById('input-n').value);
    const drift = parseFloat(document.getElementById('input-drift').value) / 100; // convert percentage to decimal
    const scale = parseFloat(document.getElementById('input-scale').value) / 100; // convert percentage to decimal
    const sigma = parseFloat(document.getElementById('input-sigma').value);
    const seed = parseInt(document.getElementById('input-seed').value);
    
    // Setup RNG
    const randFunc = mulberry32(seed);
    
    // 2. Simulate returns and price series
    const returns = [];
    for (let i = 0; i < n; i++) {
        returns.push(randomNormal(drift, scale, randFunc));
    }
    
    // Generate dates starting from 2022-01-01
    const startDate = new Date('2022-01-01');
    const dates = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        // Format as YYYY-MM-DD
        dates.push(d.toISOString().split('T')[0]);
    }
    
    // Compute prices: price = 100 * exp(cumsum(returns))
    const prices = [];
    let cumsum = 0;
    for (let i = 0; i < n; i++) {
        cumsum += returns[i];
        prices.push(100 * Math.exp(cumsum));
    }
    
    // 3. Compute metrics
    const initialPrice = prices[0];
    const finalPrice = prices[prices.length - 1];
    const totalReturn = (finalPrice / initialPrice - 1);
    
    // Compute rolling max
    const rollingMax = [];
    let currentMax = -Infinity;
    for (let i = 0; i < n; i++) {
        if (prices[i] > currentMax) {
            currentMax = prices[i];
        }
        rollingMax.push(currentMax);
    }
    
    // Compute drawdown
    const drawdowns = [];
    for (let i = 0; i < n; i++) {
        drawdowns.push((prices[i] - rollingMax[i]) / rollingMax[i]);
    }
    
    // 4. Apply Gaussian filter smoothing
    const smoothPrices = gaussianFilter1d(prices, sigma);
    const smoothRollingMax = gaussianFilter1d(rollingMax, sigma);
    const smoothDrawdowns = gaussianFilter1d(drawdowns, sigma);
    
    // Find max drawdown point based on unsmoothed or smoothed data?
    // The Python script does:
    // max_dd_idx = portfolio['Drawdown'].idxmin()
    // max_dd_val = portfolio['Drawdown'].min()
    // Let's use smoothed drawdown to align the point correctly with visual curve
    let maxDdVal = 0;
    let maxDdIdx = 0;
    for (let i = 0; i < n; i++) {
        if (smoothDrawdowns[i] < maxDdVal) {
            maxDdVal = smoothDrawdowns[i];
            maxDdIdx = i;
        }
    }
    
    const maxDdDate = dates[maxDdIdx];
    const maxDdPrice = smoothPrices[maxDdIdx];
    
    // 5. Update KPI stats UI
    document.getElementById('val-final').textContent = `$${finalPrice.toFixed(2)}`;
    
    const returnEl = document.getElementById('val-return');
    returnEl.textContent = `${(totalReturn * 100).toFixed(2)}%`;
    returnEl.className = `stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`;
    
    const maxDdEl = document.getElementById('val-max-dd');
    maxDdEl.textContent = `${(maxDdVal * 100).toFixed(2)}%`;
    
    // 6. Setup ApexCharts options
    const sharedChartOptions = {
        chart: {
            group: 'portfolio-risk',
            height: 250,
            toolbar: { show: true },
            zoom: { enabled: true },
            animations: { enabled: true }
        },
        xaxis: {
            type: 'datetime',
            categories: dates,
            labels: {
                style: { colors: '#94a3b8' }
            }
        },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.05)',
            strokeDashArray: 4
        },
        tooltip: {
            theme: 'dark',
            x: { format: 'dd MMM yyyy' }
        }
    };
    
    // Price Chart options
    const priceOptions = {
        ...sharedChartOptions,
        chart: {
            ...sharedChartOptions.chart,
            id: 'chart-price',
            type: 'line'
        },
        series: [
            {
                name: 'Smooth Price',
                data: smoothPrices.map(val => parseFloat(val.toFixed(2)))
            },
            {
                name: 'Rolling Max',
                data: smoothRollingMax.map(val => parseFloat(val.toFixed(2)))
            }
        ],
        colors: ['#3b82f6', '#f59e0b'],
        stroke: {
            width: [3, 2],
            dashArray: [0, 4]
        },
        yaxis: {
            labels: {
                formatter: val => `$${val.toFixed(2)}`,
                style: { colors: '#94a3b8' }
            },
            title: {
                text: 'Portfolio Value',
                style: { color: '#94a3b8', fontWeight: 500 }
            }
        },
        annotations: {
            points: [{
                x: new Date(maxDdDate).getTime(),
                y: parseFloat(maxDdPrice.toFixed(2)),
                marker: {
                    size: 8,
                    fillColor: '#ef4444',
                    strokeColor: '#ffffff',
                    radius: 2,
                    cssClass: 'apexcharts-custom-class'
                },
                label: {
                    borderColor: '#ef4444',
                    offsetY: 0,
                    style: {
                        color: '#fff',
                        background: '#ef4444',
                        fontWeight: 600
                    },
                    text: 'Max DD Point'
                }
            }]
        }
    };
    
    // Drawdown Chart options
    const drawdownOptions = {
        ...sharedChartOptions,
        chart: {
            ...sharedChartOptions.chart,
            id: 'chart-drawdown',
            type: 'area'
        },
        series: [
            {
                name: 'Drawdown',
                data: smoothDrawdowns.map(val => parseFloat((val * 100).toFixed(2)))
            }
        ],
        colors: ['#ef4444'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        },
        stroke: {
            width: 2
        },
        yaxis: {
            labels: {
                formatter: val => `${val.toFixed(2)}%`,
                style: { colors: '#94a3b8' }
            },
            title: {
                text: 'Drawdown %',
                style: { color: '#94a3b8', fontWeight: 500 }
            }
        },
        annotations: {
            points: [{
                x: new Date(maxDdDate).getTime(),
                y: parseFloat((maxDdVal * 100).toFixed(2)),
                marker: {
                    size: 6,
                    fillColor: '#000000',
                    strokeColor: '#ef4444',
                    radius: 2
                },
                label: {
                    borderColor: '#ef4444',
                    offsetY: -10,
                    style: {
                        color: '#fff',
                        background: '#ef4444',
                        fontWeight: 600
                    },
                    text: `Max Drawdown: ${(maxDdVal * 100).toFixed(2)}%`
                }
            }]
        }
    };
    
    // Destroy existing chart instances before recreating
    if (priceChartObj) {
        priceChartObj.destroy();
    }
    if (drawdownChartObj) {
        drawdownChartObj.destroy();
    }
    
    // Render charts
    priceChartObj = new ApexCharts(document.querySelector("#price-chart"), priceOptions);
    priceChartObj.render();
    
    drawdownChartObj = new ApexCharts(document.querySelector("#drawdown-chart"), drawdownOptions);
    drawdownChartObj.render();
}

// Initial Run and Form hook
document.addEventListener('DOMContentLoaded', () => {
    runSimulation();
    
    document.getElementById('simulation-form').addEventListener('submit', (e) => {
        e.preventDefault();
        runSimulation();
    });
});
