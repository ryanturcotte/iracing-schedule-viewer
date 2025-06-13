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
    { original : "Circuit des 24 Heures du Mans", replacement : "Le Mans" },
    { original : "Virginia International Raceway", replacement : "VIR" },
    { original : "Autodromo Internazionale Enzo e Dino Ferrari", replacement : "Imola" },
    { original : "Nürburgring Nordschleife", replacement : "Nordschleife" },
    { original : "Nürburgring", replacement : "Nurburg" },
    { original : "Hockenheimring Baden-Württemberg", replacement : "Hockenheim" },
    { original : "Circuit de Lédenon", replacement : "Ledenon" },
    { original : "WeatherTech Raceway at Laguna Seca", replacement : "Laguna Seca" },
    { original : "Autodromo Internazionale del Mugello", replacement : "Mugello" },
    { original : "Circuit de Barcelona Catalunya", replacement : "Barcelona" },
    { original : "Autodromo Nazionale Monza", replacement : "Monza" },
    { original : "Misano World Circuit Marco Simoncelli", replacement : "Misano Sic" },
    { original : "Circuit de Spa-Francorchamps", replacement : "Spa" },
    { original : "Autódromo José Carlos Pace", replacement : "Interlagos" },
    { original : "Long Beach Street Circuit", replacement : "Long Beach" },
    { original : "Canadian Tire Motorsports Park", replacement : "Mosport" },
    { original : "Detroit Grand Prix at Belle Isle", replacement : "Detroit Belle Isle" },
    { original : "Mobility Resort Motegi", replacement : "Motegi" },
    { original : "Circuit of the Americas", replacement : "COTA" },
    { original : "World Wide Technology Raceway (Gateway)", replacement : "Gateway" },
    { original : "Circuit de Jerez - Ángel Nieto", replacement : "Jerez" },
    { original : "Lucas Oil Indianapolis Raceway Park", replacement : "IRP" },
    { original : "Daytona Rallycross and Dirt Road", replacement : "Daytona" },
    { original : "Kevin Harvick's Kern Raceway", replacement : "Harvick's Kern" },
    { original : "Federated Auto Parts Raceway at I-55", replacement : "I-55" },
    { original : "Lånkebanen (Hell RX)", replacement : "Hell RX" },
    { original : "MotorLand Aragón", replacement : "Aragon" },

    // General wording replacements
    // Some of these are probably superfluous with all the above tracks
    { original : " International Circuit", replacement : "" },
    { original : " Racing Circuit", replacement : "" },
    { original : " Motorsenter", replacement : "" },
    { original : " International Raceway", replacement : "" },
    { original : " International Speedway", replacement : "" },
    { original : " International Racing Course", replacement : "" },
    { original : " Motor Raceway", replacement : "" },
    { original : " Motor Speedway", replacement : "" },
    { original : " International", replacement : "" },
    { original : " Superspeedway", replacement : "" },
    { original : " Motorsports Park", replacement : "" },
    { original : "Circuit de ", replacement : "" },
    { original : "Circuito de ", replacement : "" },
    { original : "Circuit ", replacement : "" },
    { original : " Circuit", replacement : "" },
    { original : "Motorsport Arena ", replacement : "" },
    { original : " Speedway", replacement : "" },
    { original : " Sports Car Course", replacement : "" },
    { original : " Street Circuit", replacement : "" },
    { original : "[Legacy]", replacement : "[L]" }

];

/** @type {ReplacementRule[]} */
export const trackConfigReplacements = [
    // Example: { original: "Grand Prix", replacement: "GP" },

    { original : "International", replacement : "Intl" },
    { original : "Grand Prix", replacement : "GP" },
    { original : "Road Course", replacement : "RC" },
    { original : "Summit Point Raceway", replacement : "" },
    { original : "Full Course", replacement : "Full" },
    { original : " Circuit", replacement : "" },
    { original : "24 Heures du Mans", replacement : "" },
    { original : "Industriefahrten", replacement : "" },
    { original : "Belle Isle", replacement : "" }

];

/** @type {ReplacementRule[]} */
export const carConfigReplacements = [
  // Example: { original: "Porsche 911 GT3 Cup (992)", replacement: "992 Cup" },
  // Example: { original: "Super Formula Lights", replacement: "SFL" },
  // Example: { original: "Street Stock", replacement: "SS" },
  // Add more rules here. If weekly_cars is "Car A vs Car B",
  // rules will be applied to "Car A" and "Car B" individually.

    { original: "Porsche 911 GT3 Cup (992)", replacement: "Porsche Cup" },
    { original: "Audi RS 3 LMS TCR", replacement: "Touring Cars" }
];