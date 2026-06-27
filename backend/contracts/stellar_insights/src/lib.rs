#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

const SECONDS_PER_MONTH: u64 = 30 * 86400;
const GRACE_PERIOD_MONTHS: u64 = 3;
const SCALE: i64 = 10_000;
// Default decay rate: 5% per month, represented as 500 (out of 10_000)
const DEFAULT_DECAY_RATE: i64 = 500;

#[contracttype]
#[derive(Clone, Debug)]
pub struct CreatorReputation {
    pub creator: Address,
    pub score: i64,
    pub last_activity: u64,
    pub bounties_completed: u64,
}

#[contracttype]
pub enum DataKey {
    Reputation(Address),
    DecayRate,
    Admin,
}

// Approximate e^(-rate * months) using the Taylor series:
// e^(-x) ≈ 1 - x + x²/2 - x³/6 + x⁴/24
// where x = (decay_rate * months) / SCALE
// All arithmetic stays in i64 scaled by SCALE.
fn exp_decay(decay_rate: i64, months: u64) -> i64 {
    let x = decay_rate * (months as i64);

    let term1 = SCALE * SCALE;
    let term2 = x * SCALE;
    let term3 = (x * x) / 2;
    let term4 = (x * x * x) / (6 * SCALE);
    let term5 = (x * x * x * x) / (24 * SCALE * SCALE);

    let result = term1 - term2 + term3 - term4 + term5;

    let normalized = result / SCALE;
    if normalized < 0 { 0 } else { normalized }
}

#[contract]
pub struct StellarInsightsContract;

#[contractimpl]
impl StellarInsightsContract {
    pub fn init(env: Env, admin: Address) -> bool {
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage()
            .persistent()
            .set(&DataKey::DecayRate, &DEFAULT_DECAY_RATE);
        true
    }

    pub fn set_reputation(env: Env, admin: Address, creator: Address, score: i64) -> bool {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("Contract not initialized");
        assert!(stored_admin == admin, "Only admin can set reputation");
        assert!(score >= 0, "Score must be non-negative");

        let rep = CreatorReputation {
            creator: creator.clone(),
            score,
            last_activity: env.ledger().timestamp(),
            bounties_completed: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(creator.clone()), &rep);

        env.events().publish(
            (Symbol::new(&env, "rep_set"), creator),
            score,
        );

        true
    }

    pub fn record_bounty_completion(env: Env, creator: Address, bonus: i64) -> bool {
        creator.require_auth();
        assert!(bonus >= 0, "Bonus must be non-negative");

        let mut rep: CreatorReputation = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(creator.clone()))
            .expect("Creator reputation not found");

        rep.score += bonus;
        rep.last_activity = env.ledger().timestamp();
        rep.bounties_completed += 1;

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(creator.clone()), &rep);

        env.events().publish(
            (Symbol::new(&env, "bounty_done"), creator),
            (rep.score, rep.bounties_completed),
        );

        true
    }

    pub fn get_raw_score(env: Env, creator: Address) -> i64 {
        let rep: CreatorReputation = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(creator))
            .expect("Creator reputation not found");
        rep.score
    }

    pub fn get_last_activity(env: Env, creator: Address) -> u64 {
        let rep: CreatorReputation = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(creator))
            .expect("Creator reputation not found");
        rep.last_activity
    }

    pub fn get_effective_reputation(env: Env, creator: Address) -> i64 {
        let rep: CreatorReputation = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(creator))
            .expect("Creator reputation not found");

        let now = env.ledger().timestamp();
        if now <= rep.last_activity {
            return rep.score;
        }

        let months_inactive = (now - rep.last_activity) / SECONDS_PER_MONTH;
        if months_inactive <= GRACE_PERIOD_MONTHS {
            return rep.score;
        }

        let decay_months = months_inactive - GRACE_PERIOD_MONTHS;
        let decay_rate: i64 = env
            .storage()
            .persistent()
            .get(&DataKey::DecayRate)
            .unwrap_or(DEFAULT_DECAY_RATE);

        let factor = exp_decay(decay_rate, decay_months);
        (rep.score * factor) / SCALE
    }

    pub fn get_reputation(env: Env, creator: Address) -> CreatorReputation {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation(creator))
            .expect("Creator reputation not found")
    }

    pub fn is_decaying(env: Env, creator: Address) -> bool {
        let rep: Option<CreatorReputation> = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(creator));

        match rep {
            None => false,
            Some(r) => {
                let now = env.ledger().timestamp();
                if now <= r.last_activity {
                    return false;
                }
                let months_inactive = (now - r.last_activity) / SECONDS_PER_MONTH;
                months_inactive > GRACE_PERIOD_MONTHS
            }
        }
    }

    pub fn set_decay_rate(env: Env, admin: Address, new_rate: i64) -> bool {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("Contract not initialized");
        assert!(stored_admin == admin, "Only admin can set decay rate");
        assert!(new_rate > 0 && new_rate <= SCALE, "Rate must be between 1 and 10000");

        env.storage()
            .persistent()
            .set(&DataKey::DecayRate, &new_rate);

        env.events().publish(
            (Symbol::new(&env, "decay_rate"), admin),
            new_rate,
        );

        true
    }

    pub fn get_decay_rate(env: Env) -> i64 {
        env.storage()
            .persistent()
            .get(&DataKey::DecayRate)
            .unwrap_or(DEFAULT_DECAY_RATE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    #[test]
    fn test_init_and_set_reputation() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&admin, &creator, &1000);

        assert_eq!(client.get_raw_score(&creator), 1000);
    }

    #[test]
    fn test_no_decay_within_grace_period() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&admin, &creator, &1000);

        // 2 months inactive (within 3-month grace period)
        env.ledger().set_timestamp(2 * SECONDS_PER_MONTH);

        assert_eq!(client.get_effective_reputation(&creator), 1000);
        assert!(!client.is_decaying(&creator));
    }

    #[test]
    fn test_decay_after_grace_period() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&admin, &creator, &10000);

        // 6 months inactive = 3 months past grace period
        // decay = e^(-0.05 * 3) ≈ 0.8607 → effective ≈ 8607
        env.ledger().set_timestamp(6 * SECONDS_PER_MONTH);

        let effective = client.get_effective_reputation(&creator);
        assert!(effective < 10000, "Score should have decayed");
        assert!(effective > 8000, "Score should not have decayed too much");
        assert!(client.is_decaying(&creator));
    }

    #[test]
    fn test_bounty_completion_refreshes_activity() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&admin, &creator, &1000);

        // 6 months inactive
        env.ledger().set_timestamp(6 * SECONDS_PER_MONTH);
        assert!(client.is_decaying(&creator));

        // Complete a bounty — resets activity timestamp
        client.record_bounty_completion(&creator, &100);

        assert!(!client.is_decaying(&creator));
        assert_eq!(client.get_effective_reputation(&creator), 1100);
    }

    #[test]
    fn test_governance_can_adjust_decay_rate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);

        client.init(&admin);
        assert_eq!(client.get_decay_rate(), DEFAULT_DECAY_RATE);

        // Increase decay to 10%
        client.set_decay_rate(&admin, &1000);
        assert_eq!(client.get_decay_rate(), 1000);
    }

    #[test]
    fn test_higher_decay_rate_decays_faster() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&admin, &creator, &10000);

        // 6 months inactive with default 5% decay
        env.ledger().set_timestamp(6 * SECONDS_PER_MONTH);
        let score_5pct = client.get_effective_reputation(&creator);

        // Reset and try with 10% decay
        client.set_reputation(&admin, &creator, &10000);
        client.set_decay_rate(&admin, &1000);
        let score_10pct = client.get_effective_reputation(&creator);

        assert!(
            score_10pct < score_5pct,
            "Higher decay rate should produce lower score"
        );
    }

    #[test]
    #[should_panic(expected = "Only admin can set reputation")]
    fn test_non_admin_cannot_set_reputation() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);
        let creator = Address::generate(&env);

        client.init(&admin);
        client.set_reputation(&non_admin, &creator, &1000);
    }

    #[test]
    #[should_panic(expected = "Only admin can set decay rate")]
    fn test_non_admin_cannot_set_decay_rate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StellarInsightsContract, ());
        let client = StellarInsightsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);

        client.init(&admin);
        client.set_decay_rate(&non_admin, &500);
    }
}
