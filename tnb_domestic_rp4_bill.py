from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_UP
import argparse
import json


MONEY_STEP = Decimal("0.01")


@dataclass
class ResidentialTariffConfig:
    billing_days: int = 30
    usage_kwh: Decimal = Decimal("600")

    # RP4 residential tariff schedule for Peninsular Malaysia, effective 1 July 2025.
    energy_sen_per_kwh_le_1500: Decimal = Decimal("27.03")
    energy_sen_per_kwh_gt_1500: Decimal = Decimal("37.03")
    capacity_sen_per_kwh: Decimal = Decimal("4.55")
    network_sen_per_kwh: Decimal = Decimal("12.85")
    retail_rm_per_month: Decimal = Decimal("10.00")

    # Bill adjustments and statutory charges.
    afa_sen_per_kwh: Decimal = Decimal("0.00")
    kwtbb_percent: Decimal = Decimal("1.6")
    service_tax_percent: Decimal = Decimal("8.0")

    # Residential retail charge is waived at or below 600 kWh.
    retail_waiver_threshold_kwh: Decimal = Decimal("600")

    # RMCD electricity SST rule:
    # - no SST for domestic customers at or below 600 kWh for billing cycles >= 28 days
    # - below 28 days, the whole usage may be taxable
    service_tax_threshold_kwh: Decimal = Decimal("600")
    service_tax_min_days: int = 28

    # KWTBB is typically applied to electricity consumption charges.
    include_retail_in_kwtbb: bool = False

    # EEI rebate table from the domestic tariff example.
    eei_bands: tuple = (
        (Decimal("200"), Decimal("25.00")),
        (Decimal("250"), Decimal("24.50")),
        (Decimal("300"), Decimal("22.50")),
        (Decimal("350"), Decimal("21.00")),
        (Decimal("400"), Decimal("17.00")),
        (Decimal("450"), Decimal("14.50")),
        (Decimal("500"), Decimal("12.00")),
        (Decimal("550"), Decimal("10.50")),
        (Decimal("600"), Decimal("9.00")),
        (Decimal("650"), Decimal("7.50")),
        (Decimal("700"), Decimal("5.50")),
        (Decimal("750"), Decimal("4.50")),
        (Decimal("800"), Decimal("4.00")),
        (Decimal("850"), Decimal("2.50")),
        (Decimal("900"), Decimal("1.00")),
        (Decimal("1000"), Decimal("0.50")),
    )


def to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value: Decimal) -> Decimal:
    return to_decimal(value).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def sen_to_rm(sen: Decimal) -> Decimal:
    return to_decimal(sen) / Decimal("100")


def resolve_eei_rate_sen_per_kwh(usage: Decimal, config: ResidentialTariffConfig) -> Decimal:
    for upper_bound, rate in config.eei_bands:
        if usage <= upper_bound:
            return rate
    return Decimal("0.00")


def calculate_energy_charge(usage: Decimal, config: ResidentialTariffConfig) -> Decimal:
    first_band_usage = min(usage, Decimal("1500"))
    higher_band_usage = max(Decimal("0.00"), usage - Decimal("1500"))
    first_band_charge = sen_to_rm(config.energy_sen_per_kwh_le_1500 * first_band_usage)
    higher_band_charge = sen_to_rm(config.energy_sen_per_kwh_gt_1500 * higher_band_usage)
    return money(first_band_charge + higher_band_charge)


def calculate_residential_bill(usage_kwh: float, config: ResidentialTariffConfig) -> dict:
    usage = to_decimal(usage_kwh)
    if usage < 0:
        raise ValueError("kWh must be >= 0")
    if config.billing_days <= 0:
        raise ValueError("billing_days must be >= 1")

    energy_rate = config.energy_sen_per_kwh_le_1500 if usage <= Decimal("1500") else config.energy_sen_per_kwh_gt_1500
    energy_charge = calculate_energy_charge(usage, config)
    capacity_charge = money(sen_to_rm(config.capacity_sen_per_kwh * usage))
    network_charge = money(sen_to_rm(config.network_sen_per_kwh * usage))

    retail_charge = money(config.retail_rm_per_month if usage > config.retail_waiver_threshold_kwh else Decimal("0.00"))
    base_bill = money(energy_charge + capacity_charge + network_charge + retail_charge)

    afa_adjustment = money(sen_to_rm(config.afa_sen_per_kwh * usage))
    eei_rate_sen_per_kwh = resolve_eei_rate_sen_per_kwh(usage, config) if usage <= Decimal("1000") else Decimal("0.00")
    eei_credit = money(sen_to_rm(eei_rate_sen_per_kwh * usage))
    subtotal_after_afa = money(base_bill + afa_adjustment)

    non_taxable_usage = min(usage, Decimal("600"))
    taxable_usage = max(Decimal("0.00"), usage - Decimal("600"))
    energy_charge_non_taxable = calculate_energy_charge(non_taxable_usage, config)
    energy_charge_applicable = money(energy_charge - energy_charge_non_taxable)

    non_applicable_gross = money(
        energy_charge_non_taxable
        + sen_to_rm(config.capacity_sen_per_kwh * non_taxable_usage)
        + sen_to_rm(config.network_sen_per_kwh * non_taxable_usage)
        + afa_adjustment * (non_taxable_usage / usage if usage > 0 else Decimal("0.00"))
    )
    applicable_gross = money(
        energy_charge_applicable
        + sen_to_rm(config.capacity_sen_per_kwh * taxable_usage)
        + sen_to_rm(config.network_sen_per_kwh * taxable_usage)
        + retail_charge
        + afa_adjustment * (taxable_usage / usage if usage > 0 else Decimal("0.00"))
    )

    eei_non_applicable = money(eei_credit * (non_taxable_usage / usage if usage > 0 else Decimal("0.00")))
    eei_applicable = money(eei_credit - eei_non_applicable)

    current_month_usage_non_applicable = money(non_applicable_gross - eei_non_applicable)
    current_month_usage_applicable = money(applicable_gross - eei_applicable)
    current_month_usage_charge = money(current_month_usage_non_applicable + current_month_usage_applicable)
    service_tax_applies = (
        config.billing_days < config.service_tax_min_days
        or usage > config.service_tax_threshold_kwh
    )

    kwtbb_base = money(current_month_usage_charge - retail_charge)
    if config.include_retail_in_kwtbb:
        kwtbb_base = current_month_usage_charge

    kwtbb_fund = money(kwtbb_base * (config.kwtbb_percent / Decimal("100")))
    service_tax_non_applicable = Decimal("0.00")
    service_tax_applicable = money(current_month_usage_applicable * (config.service_tax_percent / Decimal("100")))
    service_tax = money(service_tax_non_applicable + service_tax_applicable)
    service_tax_taxable_base = current_month_usage_applicable
    subtotal_before_tax = money(current_month_usage_charge + kwtbb_fund)

    total_bill = money(current_month_usage_charge + kwtbb_fund + service_tax)

    return {
        "billing_days": config.billing_days,
        "usage_kwh": float(money(usage)),
        "tariff_category": "Domestic",
        "energy_rate_sen_per_kwh": float(money(energy_rate)),
        "capacity_rate_sen_per_kwh": float(money(config.capacity_sen_per_kwh)),
        "network_rate_sen_per_kwh": float(money(config.network_sen_per_kwh)),
        "retail_charge": float(retail_charge),
        "energy_charge": float(energy_charge),
        "capacity_charge": float(capacity_charge),
        "network_charge": float(network_charge),
        "base_bill": float(base_bill),
        "eei_rate_sen_per_kwh": float(money(eei_rate_sen_per_kwh)),
        "eei_credit": float(eei_credit),
        "current_month_usage_non_applicable": float(current_month_usage_non_applicable),
        "current_month_usage_applicable": float(current_month_usage_applicable),
        "current_month_usage_charge": float(current_month_usage_charge),
        "kwtbb_fund": float(kwtbb_fund),
        "service_tax_non_applicable": float(service_tax_non_applicable),
        "service_tax_applicable": float(service_tax_applicable),
        "service_tax": float(service_tax),
        "service_tax_applies": service_tax_applies,
        "total_bill": float(total_bill),
        "_debug": {
            "config": asdict(config),
            "afa_adjustment": float(afa_adjustment),
            "eei_credit": float(eei_credit),
            "subtotal_after_afa": float(subtotal_after_afa),
            "non_applicable_gross": float(non_applicable_gross),
            "applicable_gross": float(applicable_gross),
            "eei_non_applicable": float(eei_non_applicable),
            "eei_applicable": float(eei_applicable),
            "current_month_usage_charge": float(current_month_usage_charge),
            "subtotal_before_tax": float(subtotal_before_tax),
            "kwtbb_base": float(money(kwtbb_base)),
            "service_tax_taxable_base": float(money(service_tax_taxable_base)),
        },
    }


def print_bill(result: dict) -> None:
    print("TNB Domestic RP4 Bill")
    print("-" * 50)
    print(json.dumps({k: v for k, v in result.items() if k != "_debug"}, indent=2))
    print()
    print("Itemized Breakdown")
    print("-" * 50)
    debug = result["_debug"]
    print(f"Billing days:          {result['billing_days']}")
    print(f"Usage:                 {result['usage_kwh']:.2f} kWh")
    print(f"Energy charge:         RM {result['energy_charge']:.2f}")
    print(f"Capacity charge:       RM {result['capacity_charge']:.2f}")
    print(f"Network charge:        RM {result['network_charge']:.2f}")
    print(f"Retail charge:         RM {result['retail_charge']:.2f}")
    print(f"Base bill:             RM {result['base_bill']:.2f}")
    print(f"AFA adjustment:        RM {debug['afa_adjustment']:.2f}")
    print(f"Subtotal after AFA:    RM {debug['subtotal_after_afa']:.2f}")
    print(f"EEI rate:              {result['eei_rate_sen_per_kwh']:.2f} sen/kWh")
    print(f"EEI credit:            RM {result['eei_credit']:.2f}")
    print(f"Non-applicable usage:  RM {result['current_month_usage_non_applicable']:.2f}")
    print(f"Applicable usage:      RM {result['current_month_usage_applicable']:.2f}")
    print(f"Current usage charge:  RM {result['current_month_usage_charge']:.2f}")
    print(f"KWTBB base:            RM {debug['kwtbb_base']:.2f}")
    print(f"KWTBB fund:            RM {result['kwtbb_fund']:.2f}")
    print(f"SST non-applicable:    RM {result['service_tax_non_applicable']:.2f}")
    print(f"SST applicable:        RM {result['service_tax_applicable']:.2f}")
    print(f"Service tax:           RM {result['service_tax']:.2f}")
    print(f"TOTAL BILL:            RM {result['total_bill']:.2f}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Calculate a domestic RP4 electricity bill.")
    parser.add_argument("kwh", nargs="?", type=float, default=600.0, help="Monthly usage in kWh.")
    parser.add_argument("--billing-days", dest="billing_days", type=int, default=30, help="Billing cycle length in days.")
    parser.add_argument("--afa-sen-per-kwh", dest="afa_sen_per_kwh", type=float, default=0.0, help="AFA in sen per kWh.")
    parser.add_argument("--kwtbb-percent", dest="kwtbb_percent", type=float, default=1.6, help="KWTBB percentage.")
    parser.add_argument("--service-tax-percent", dest="service_tax_percent", type=float, default=8.0, help="Service tax percentage.")
    parser.add_argument("--include-retail-in-kwtbb", action="store_true", help="Include retail charge in the KWTBB base.")
    return parser


if __name__ == "__main__":
    args = build_arg_parser().parse_args()
    config = ResidentialTariffConfig(
        billing_days=args.billing_days,
        afa_sen_per_kwh=to_decimal(args.afa_sen_per_kwh),
        kwtbb_percent=to_decimal(args.kwtbb_percent),
        service_tax_percent=to_decimal(args.service_tax_percent),
        include_retail_in_kwtbb=args.include_retail_in_kwtbb,
    )

    result = calculate_residential_bill(args.kwh, config)
    print_bill(result)
