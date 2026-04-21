from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_UP
import argparse
import json


MONEY_STEP = Decimal("0.01")


@dataclass
class TariffConfig:
    tariff_group: str = "LV_COMMERCIAL"
    demand_kw: Decimal = Decimal("0.00")

    # Real-life LV non-domestic itemized tariff components.
    energy_sen_per_kwh: Decimal = Decimal("27.03")
    capacity_sen_per_kwh: Decimal = Decimal("8.83")
    network_sen_per_kwh: Decimal = Decimal("14.82")
    retail_rm_per_month: Decimal = Decimal("20.00")

    # Optional adjustments.
    afa_sen_per_kwh: Decimal = Decimal("0.00")
    kwtbb_percent: Decimal = Decimal("1.6")
    service_tax_percent: Decimal = Decimal("0.0")

    # Keep this false unless you intentionally want retail included in KWTBB.
    include_retail_in_kwtbb: bool = False


def to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value: Decimal) -> Decimal:
    return to_decimal(value).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def sen_to_rm(sen: Decimal) -> Decimal:
    return to_decimal(sen) / Decimal("100")


def calculate_lv_non_domestic_bill(kwh_usage: float, config: TariffConfig) -> dict:
    usage = to_decimal(kwh_usage)
    if usage < 0:
        raise ValueError("kWh must be >= 0")

    energy_charge = money(sen_to_rm(config.energy_sen_per_kwh * usage))
    capacity_charge = money(sen_to_rm(config.capacity_sen_per_kwh * usage))
    network_charge = money(sen_to_rm(config.network_sen_per_kwh * usage))
    retail_charge = money(config.retail_rm_per_month)

    base_bill = money(energy_charge + capacity_charge + network_charge + retail_charge)

    afa_adjustment = money(sen_to_rm(config.afa_sen_per_kwh * usage))
    subtotal_after_afa = money(base_bill + afa_adjustment)

    kwtbb_base = energy_charge + capacity_charge + network_charge + afa_adjustment
    if config.include_retail_in_kwtbb:
        kwtbb_base += retail_charge

    kwtbb_fund = money(kwtbb_base * (config.kwtbb_percent / Decimal("100")))
    subtotal_before_tax = money(subtotal_after_afa + kwtbb_fund)
    sst_tax = money(subtotal_before_tax * (config.service_tax_percent / Decimal("100")))
    total_bill = money(subtotal_before_tax + sst_tax)

    return {
        "usage_kwh": float(money(usage)),
        "tariff_group": config.tariff_group,
        "demand_kw": float(money(config.demand_kw)),
        "retail_charge": float(retail_charge),
        "energy_charge": float(energy_charge),
        "capacity_charge": float(capacity_charge),
        "network_charge": float(network_charge),
        "base_bill": float(base_bill),
        "kwtbb_fund": float(kwtbb_fund),
        "sst_tax": float(sst_tax),
        "total_bill": float(total_bill),
        "_debug": {
            "config": asdict(config),
            "afa_adjustment": float(afa_adjustment),
            "subtotal_after_afa": float(subtotal_after_afa),
            "subtotal_before_tax": float(subtotal_before_tax),
            "kwtbb_base": float(money(kwtbb_base)),
        },
    }


def print_bill(result: dict) -> None:
    print("Real-life LV Non-Domestic Bill")
    print("-" * 50)
    print(json.dumps({k: v for k, v in result.items() if k != "_debug"}, indent=2))
    print()
    print("Itemized Breakdown")
    print("-" * 50)
    debug = result["_debug"]
    print(f"Usage:                 {result['usage_kwh']:.2f} kWh")
    print(f"Energy charge:         RM {result['energy_charge']:.2f}")
    print(f"Capacity charge:       RM {result['capacity_charge']:.2f}")
    print(f"Network charge:        RM {result['network_charge']:.2f}")
    print(f"Retail charge:         RM {result['retail_charge']:.2f}")
    print(f"Base bill:             RM {result['base_bill']:.2f}")
    print(f"AFA adjustment:        RM {debug['afa_adjustment']:.2f}")
    print(f"Subtotal after AFA:    RM {debug['subtotal_after_afa']:.2f}")
    print(f"KWTBB base:            RM {debug['kwtbb_base']:.2f}")
    print(f"KWTBB fund:            RM {result['kwtbb_fund']:.2f}")
    print(f"Subtotal before tax:   RM {debug['subtotal_before_tax']:.2f}")
    print(f"SST tax:               RM {result['sst_tax']:.2f}")
    print(f"TOTAL BILL:            RM {result['total_bill']:.2f}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Calculate a real-life LV non-domestic electricity bill.")
    parser.add_argument("kwh", nargs="?", type=float, default=500.0, help="Monthly usage in kWh.")
    parser.add_argument("--afa-sen-per-kwh", dest="afa_sen_per_kwh", type=float, default=0.0, help="AFA in sen per kWh.")
    parser.add_argument("--kwtbb-percent", dest="kwtbb_percent", type=float, default=1.6, help="KWTBB percentage.")
    parser.add_argument("--service-tax-percent", dest="service_tax_percent", type=float, default=0.0, help="Service tax percentage.")
    parser.add_argument("--include-retail-in-kwtbb", action="store_true", help="Include retail charge in the KWTBB base.")
    return parser


if __name__ == "__main__":
    args = build_arg_parser().parse_args()
    config = TariffConfig(
        afa_sen_per_kwh=to_decimal(args.afa_sen_per_kwh),
        kwtbb_percent=to_decimal(args.kwtbb_percent),
        service_tax_percent=to_decimal(args.service_tax_percent),
        include_retail_in_kwtbb=args.include_retail_in_kwtbb,
    )

    result = calculate_lv_non_domestic_bill(args.kwh, config)
    print_bill(result)
