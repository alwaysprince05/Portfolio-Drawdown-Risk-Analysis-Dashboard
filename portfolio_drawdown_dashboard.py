import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter1d

# Simulate price series (replace with real data if needed)
np.random.seed(42)
n = 500
dates = pd.date_range('2022-01-01', periods=n)
returns = np.random.normal(loc=0.0005, scale=0.01, size=n)
price = 100 * np.exp(np.cumsum(returns))

# Create DataFrame
portfolio = pd.DataFrame({'Price': price}, index=dates)

# Compute cumulative returns
portfolio['Cumulative Return'] = portfolio['Price'] / portfolio['Price'].iloc[0] - 1

# Compute rolling max (for drawdown)
portfolio['Rolling Max'] = portfolio['Price'].cummax()

# Compute drawdown
portfolio['Drawdown'] = (portfolio['Price'] - portfolio['Rolling Max']) / portfolio['Rolling Max']

# Smooth price and drawdown for visualization
portfolio['Smooth Price'] = gaussian_filter1d(portfolio['Price'], sigma=3)
portfolio['Smooth Drawdown'] = gaussian_filter1d(portfolio['Drawdown'], sigma=3)
portfolio['Smooth Rolling Max'] = gaussian_filter1d(portfolio['Rolling Max'], sigma=3)

# Find max drawdown point
max_dd_idx = portfolio['Drawdown'].idxmin()
max_dd_val = portfolio['Drawdown'].min()

# Plotting
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), sharex=True, gridspec_kw={'height_ratios': [2, 1]})

# Top plot: Price and rolling max
ax1.plot(portfolio.index, portfolio['Smooth Price'], label='Price', color='blue', lw=2)
ax1.plot(portfolio.index, portfolio['Smooth Rolling Max'], label='Rolling Max', color='orange', linestyle='--', lw=1.5)
ax1.set_ylabel('Portfolio Value')
ax1.set_title('Portfolio Drawdown Analysis')
ax1.legend(loc='upper left')

# Highlight max drawdown point
ax1.scatter(max_dd_idx, portfolio.loc[max_dd_idx, 'Smooth Price'], color='red', zorder=5, label='Max Drawdown')
ax1.legend()

# Bottom plot: Drawdown
ax2.fill_between(portfolio.index, portfolio['Smooth Drawdown'], 0, where=portfolio['Smooth Drawdown']<0, color='red', alpha=0.5)
ax2.plot(portfolio.index, portfolio['Smooth Drawdown'], color='red', lw=2)
ax2.scatter(max_dd_idx, max_dd_val, color='black', zorder=5)
ax2.set_ylabel('Drawdown')
ax2.set_xlabel('Date')
ax2.set_ylim(portfolio['Smooth Drawdown'].min()*1.1, 0.01)
ax2.set_title('Drawdown (Negative Values)')

# Annotate max drawdown
ax2.annotate(f"Max Drawdown: {max_dd_val:.2%}",
             xy=(max_dd_idx, max_dd_val),
             xytext=(max_dd_idx, max_dd_val-0.1),
             arrowprops=dict(facecolor='black', shrink=0.05),
             fontsize=10, color='black')

plt.tight_layout()
plt.show()
