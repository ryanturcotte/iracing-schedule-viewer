// src/trackMappings.js

/**
 * @typedef {Object} ReplacementRule
 * @property {string} original - The string to be replaced.
 * @property {string} replacement - The string to replace with.
 */

/** @type {ReplacementRule[]} */
export const trackNameReplacements = [
    // Example: { original: "WeatherTech Raceway Laguna Seca", replacement: "Laguna Seca" },

    // Specific track replacements
    { original: "Circuit des 24 Heures du Mans", replacement: "Le Mans" },
    { original: "Virginia International Raceway", replacement: "VIR" },
    { original: "Autodromo Internazionale Enzo e Dino Ferrari", replacement: "Imola" },
    { original: "Nürburgring Nordschleife", replacement: "Nordschleife" },
    { original: "Nürburgring", replacement: "Nurburg" },
    { original: "Hockenheimring Baden-Württemberg", replacement: "Hockenheim" },
    { original: "Circuit de Lédenon", replacement: "Ledenon" },
    { original: "WeatherTech Raceway at Laguna Seca", replacement: "Laguna Seca" },
    { original: "Autodromo Internazionale del Mugello", replacement: "Mugello" },
    { original: "Circuit de Barcelona Catalunya", replacement: "Barcelona" },
    { original: "Autodromo Nazionale Monza", replacement: "Monza" },
    { original: "Misano World Circuit Marco Simoncelli", replacement: "Misano Sic" },
    { original: "Circuit de Spa-Francorchamps", replacement: "Spa" },
    { original: "Autódromo José Carlos Pace", replacement: "Interlagos" },
    { original: "Long Beach Street Circuit", replacement: "Long Beach" },
    { original: "Canadian Tire Motorsports Park", replacement: "Mosport" },
    { original: "Detroit Grand Prix at Belle Isle", replacement: "Detroit Belle Isle" },
    { original: "Mobility Resort Motegi", replacement: "Motegi" },
    { original: "Circuit of the Americas", replacement: "COTA" },
    { original: "World Wide Technology Raceway (Gateway)", replacement: "Gateway" },
    { original: "Circuit de Jerez - Ángel Nieto", replacement: "Jerez" },
    { original: "Lucas Oil Indianapolis Raceway Park", replacement: "IRP" },
    { original: "Daytona Rallycross and Dirt Road", replacement: "Daytona" },
    { original: "Kevin Harvick's Kern Raceway", replacement: "Harvick's Kern" },
    { original: "Federated Auto Parts Raceway at I-55", replacement: "I-55" },
    { original: "Lånkebanen (Hell RX)", replacement: "Hell RX" },
    { original: "MotorLand Aragón", replacement: "Aragon" },
    { original: "Shell V-Power Motorsport Park at The Bend", replacement: "The Bend" },
    { original: "Autódromo Hermanos Rodríguez", replacement: "Mexico" },

    // General wording replacements
    // Some of these are probably superfluous with all the above tracks
    { original: " International Circuit", replacement: "" },
    { original: " Racing Circuit", replacement: "" },
    { original: " Motorsenter", replacement: "" },
    { original: " International Raceway", replacement: "" },
    { original: " International Speedway", replacement: "" },
    { original: " International Racing Course", replacement: "" },
    { original: " Motor Raceway", replacement: "" },
    { original: " Motor Speedway", replacement: "" },
    { original: " International", replacement: "" },
    { original: " Superspeedway", replacement: "" },
    { original: " Motorsports Park", replacement: "" },
    { original: "Circuit de ", replacement: "" },
    { original: "Circuito de ", replacement: "" },
    { original: "Circuit ", replacement: "" },
    { original: " Circuit", replacement: "" },
    { original: "Motorsport Arena ", replacement: "" },
    { original: " Speedway", replacement: "" },
    { original: " Sports Car Course", replacement: "" },
    { original: " Street Circuit", replacement: "" },
    { original: "[Legacy]", replacement: "[L]" }

];

/** @type {ReplacementRule[]} */
export const trackConfigReplacements = [
    // Example: { original: "Grand Prix", replacement: "GP" },

    { original: "International", replacement: "Intl" },
    { original: "Grand Prix", replacement: "GP" },
    { original: "Road Course", replacement: "RC" },
    { original: "Summit Point Raceway", replacement: "" },
    { original: "Full Course", replacement: "Full" },
    { original: " Circuit", replacement: "" },
    { original: "24 Heures du Mans", replacement: "" },
    { original: "Industriefahrten", replacement: "" },
    { original: "Belle Isle", replacement: "" }

];

/** @type {ReplacementRule[]} */
export const carConfigReplacements = [
    // Example: { original: "Porsche 911 GT3 Cup (992)", replacement: "992 Cup" },
    // Example: { original: "Super Formula Lights", replacement: "SFL" },
    // Example: { original: "Street Stock", replacement: "SS" },
    // Add more rules here. If weekly_cars is "Car A vs Car B",
    // rules will be applied to "Car A" and "Car B" individually.

    { original: "Porsche 911 GT3 Cup (992)", replacement: "Porsche Cup" },
    { original: "Audi RS 3 LMS TCR, Hyundai Elantra N TCR, Honda Civic Type R TCR, Hyundai Veloster N TCR", replacement: "Touring Cars" },
    { original: "Audi RS 3 LMS TCR, Hyundai Elantra N TCR Honda Civic Type R TCR, Hyundai Veloster N TCR", replacement: "Touring Cars" },
    { original: "Ford Fiesta RS WRC, Subaru WRX STI, VW Beetle", replacement: "Rally Cars" },
    { original: "Porsche 718 Cayman GT4 Clubsport MR McLaren 570S GT4 / Aston Martin Vantage GT4 Mercedes-AMG GT4 / BMW M4 G82 GT4 Evo Ford Mustang GT4", replacement: "GT4" },
    { original: "Aston Martin DBR9 GT1, Chevrolet Corvette C6.R GT1", replacement: "GT1" },
    { original: "BMW M8 GTE, Chevrolet Corvette C8.R GTE, Ferrari 488 GTE, Ford GTE, Porsche 911 RSR", replacement: "GTE" },
    { original: "Dirt Outlaw Micro Sprint Car - Winged", replacement: "Outlaw Micro (Winged)" },
    { original: "Dirt Outlaw Micro Sprint Car - Non-Winged", replacement: "Outlaw Micro (Non-Winged)" },
    { original: "Gen 4 Chevrolet Monte Carlo - 2003, Gen 4 Ford Taurus - 2003", replacement: "NASCAR Cup Gen 4" },
    { original: "NASCAR Cup Series Next Gen Chevrolet Camaro ZL1, NASCAR Cup Series Next Gen Ford Mustang, NASCAR Cup Series Next Gen Toyota Camry", replacement: "NASCAR Next Gen" },
    { original: "NASCAR Legends Buick LeSabre - 1987, NASCAR Legends Chevrolet Monte Carlo - 1987, NASCAR Legends Ford Thunderbird - 1987, NASCAR Legends Pontiac Grand Prix - 1987", replacement: "NASCAR Cup 1987" },
    { original: "ARCA Chevrolet SS, ARCA Ford Mustang, ARCA Toyota Camry", replacement: "ARCA" },
    { original: "[Legacy] NASCAR Cup Chevrolet Impala COT - 2009", replacement: "NASCAR COT" },
    { original: "NASCAR XFINITY Chevrolet Camaro, NASCAR XFINITY Ford Mustang, NASCAR XFINITY Toyota Supra", replacement: "NASCAR XFINITY" },
    { original: "NASCAR Truck Chevrolet Silverado, NASCAR Truck Ford F150, NASCAR Truck Toyota Tundra TRD Pro", replacement: "NASCAR Trucks" },
    { original: "Street Stock - Panther C1, Street Stock - Casino M2, Street Stock - Eagle T3", replacement: "Street Stocks" },
    { original: "BMW M4 GT3 EVO / Lamborghini Huracán GT3 EVO / Mercedes-AMG GT3 2020 / Porsche 911 GT3 R (992) / Ferrari 296 GT3 / Audi R8 LMS EVO II GT3 / Chevrolet Corvette Z06 GT3.R Ford Mustang GT3 / McLaren 720S GT3 EVO Acura NSX GT3 EVO 22 / Aston Martin Vantage GT3 EVO", replacement: "GT3" },
    { original: "Skip Barber Formula 2000", replacement: "The Skippy" }

];

export const timeReplacements = [

    // This should get the weird Ring Meister time to be more readable
    { original: "Races on every hour on the hour | Qualifying every hour at :30", replacement: "Race at :00 Qual at :30" },

    { original: "Races every hour", replacement: "Hourly" },
    { original: "Races every 2 hours", replacement: "Every 2 Hrs" },
    // Add more time/frequency replacements here

    { original: "Races ", replacement: "" },
    { original: "every hour", replacement: "hourly" },
    { original: " past", replacement: "" },
    { original: "minutes", replacement: "mins" },
    { original: "at :00 and :30", replacement: ":00/:30" },
    { original: "at :15 and :45", replacement: ":15/:45" },
    { original: " after", replacement: "" }


];
