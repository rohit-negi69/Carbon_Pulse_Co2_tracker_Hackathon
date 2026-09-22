// ---------------------------------------------------------------------------
// Labelled training corpus for the activity text classifier.
//
// These are the phrasings people actually type into the copilot ("drove to
// work", "took the metro", "ran the dishwasher"), written in the user's voice
// rather than as keywords. Two deliberate properties:
//
//  • The six transport/energy/food classes overlap heavily on shared verbs
//    ("took", "had", "ran"), so each class carries its own distinctive nouns.
//    That overlap is what makes the car↔bus boundary the model's hardest
//    decision, which is exactly the boundary a real ledger cares about.
//
//  • `unknown` is a real class, not a fallback. A model forced to choose
//    between six categories will confidently mislabel "I paid my rent"; being
//    able to predict *no category* is a feature, and it currently scores ~1.0
//    confidence on out-of-domain sentences.
//
// When a user confirms or corrects a prediction the phrase is folded back in,
// so the model sharpens against this deployment's real traffic.
// ---------------------------------------------------------------------------

export const CORPUS = {
  car: [
    'drove to work', 'drove 15 km', 'i drove my car', 'drove to campus and back',
    'took the car to the shops', 'car commute today', 'drove the kids to school',
    'did 40 km by car', 'road trip in the car', 'drove to the airport',
    'taxi home from the station', 'uber to the office', 'cab ride downtown',
    'drove 12 kilometres', 'went by car to the client', 'car travel 30 km',
    'i drove 25 km this morning', 'took an uber 8 km', 'drove around town running errands',
    'commute by car', 'rode in a taxi for 6 km', 'drove to visit my parents 120 km',
    'car journey 55 km', 'drove the van to the site', 'i took a cab to dinner',
    'drove back from the gym', 'by car to the grocery store', 'car miles today',
    'grabbed a taxi across town', 'drove my hatchback to the mechanic',
    'car trip to the beach', 'drove the suv into the city', 'carpooled with a colleague',
    'drove 8 miles to the office', 'took a rideshare home', 'behind the wheel for an hour',
    'driving the truck to the warehouse', 'i was driving all afternoon',
    'drove to the dentist', 'car ride to the airport', 'my car used 30 km today',
    'drove the minivan on the school run', 'car kilometres for the week',
    'drove to the train station and parked', 'petrol for the car this week',
    'drove 200 km visiting family',
  ],
  bus: [
    'took the bus to work', 'bus ride 10 km', 'caught the bus downtown',
    'bus commute today', 'rode the bus 6 km', 'i took the bus home',
    'bus travel 20 km', 'took a coach to the city', 'bus to campus and back',
    'went by bus to the market', 'shuttle bus to the terminal', 'public bus 14 km',
    'took the metro to work', 'metro ride 9 km', 'took the tube across london',
    'subway to the office', 'rode the tram into town', 'local train 30 km',
    'took the train to the next city', 'commuter rail 45 km', 'bus journey to the airport',
    'i bussed it today', 'took the light rail downtown', 'city bus 5 km',
    'hop on hop off bus tour', 'regional train 80 km', 'took the ferry across the bay',
    'boarded the bus for 12 km', 'caught the night bus home', 'on the bus for forty minutes',
    'took public transport today', 'metro and bus combination', 'rail replacement bus',
    'intercity train 220 km', 'took the express coach', 'bus pass journey to college',
    'rode the shuttle to the hotel', 'tram ride across the city', 'underground for six stops',
    'bus to the hospital', 'i commuted by bus', 'train journey to see friends',
    'high speed rail 300 km', 'the number 12 bus into town', 'coach trip to the coast',
    'metro card topped up and travelled 25 km',
  ],
  flight: [
    'flew to delhi', 'flight 1200 km', 'took a flight to kochi',
    'flying home for the holidays', 'domestic flight 800 km', 'took a plane to mumbai',
    'flight to london heathrow', 'i flew 2000 km', 'air travel this week',
    'hopped on a plane to singapore', 'international flight 6500 km',
    'return flight 1400 km', 'flew business to dubai', 'short haul flight 400 km',
    'long haul flight to new york', 'plane ride to bangalore',
    'red eye flight home', 'took two flights this week', 'flew out for a conference',
    'charter flight 300 km', 'helicopter transfer to the rig', 'flight leg 950 km',
    'flew to see family 500 km', 'boarding pass for the evening flight',
    'checked in for my flight', 'layover in doha', 'transatlantic flight',
    'flew economy to singapore', 'airport transfer and flight', 'took off for goa',
    'weekend trip by plane', 'flight from heathrow to rome', 'jet to the conference',
    'i was on a plane for six hours', 'flew domestic twice this month',
    'air miles this quarter', 'piloted a small aircraft', 'seaplane to the island',
    'connecting flight through frankfurt', 'flight distance 3200 km',
  ],
  electricity: [
    'used 8 kwh of electricity', 'ran the ac all day', 'electricity bill 240 kwh',
    'consumed 12 kwh', 'ran the dishwasher', 'did the laundry twice',
    'tumble dryer 3 kwh', 'air conditioner for 5 hours', 'heater on all evening',
    'used 30 kwh this week', 'power consumption today', 'ran the washing machine',
    'electric oven for two hours', 'charged the ev 40 kwh', 'kettle and microwave',
    'ran the pool pump', 'server rack drew 9 kwh', 'boiler ran all night',
    'space heater 4 kwh', 'lights left on overnight', 'fridge and freezer load',
    'ev charging session 55 kwh', 'ran the vacuum and iron', 'electric shower',
    'used 6.5 kwh today', 'ac set to 18 degrees all afternoon',
    'heat pump ran for six hours', 'electric water heater 5 kwh',
    'charged my laptop and phone', 'ran the air fryer', 'dehumidifier overnight',
    'switched on the central heating', 'used the induction hob for an hour',
    'solar panels generated 12 kwh', 'battery storage discharged 4 kwh',
    'electricity meter reading 300 kwh', 'ran the ceiling fans all day',
    'welder drew 15 kwh', 'greenhouse heating 20 kwh',
  ],
  veg_meal: [
    'ate a veg meal', 'had a vegetarian lunch', 'plant based dinner',
    'ate 2 veg meals', 'veggie burger for lunch', 'salad and soup for dinner',
    'tofu stir fry', 'vegetarian thali', 'ate a vegan burrito',
    'dal and rice for dinner', 'falafel wrap for lunch', 'veggie pizza tonight',
    'had a meat free monday', 'chana masala for dinner', 'oatmeal and fruit breakfast',
    'vegetable curry for lunch', 'had a plant based burger', 'my salad lunch',
    'veggie sushi', 'lentil soup dinner', 'bean chilli for dinner',
    'skipped meat today', 'ate vegetarian all day', 'paneer wrap lunch',
    'mushroom risotto for dinner', 'chickpea salad bowl', 'vegan smoothie breakfast',
    'tempeh tacos', 'halloumi and roasted veg', 'quinoa bowl for lunch',
    'hummus and pita', 'veggie spring rolls', 'jackfruit curry',
    'oat milk latte and a vegan muffin', 'vegetarian pasta bake',
    'cooked a veg stir fry', 'stuffed peppers for dinner',
  ],
  non_veg_meal: [
    'ate a non veg meal', 'had chicken for lunch', 'ate 2 non-veg meals',
    'beef burger for dinner', 'steak dinner tonight', 'chicken biryani for lunch',
    'ate lamb curry', 'pork chop dinner', 'fish and chips lunch',
    'had a chicken shawarma', 'mutton curry for dinner', 'salmon dinner',
    'ordered a pepperoni pizza', 'bacon and eggs breakfast', 'turkey sandwich lunch',
    'ate fried chicken', 'prawn curry for dinner', 'grilled chicken salad',
    'had a kebab after the pub', 'sausage roll snack', 'mcdonalds big mac meal',
    'nando half chicken', 'roast beef sunday lunch', 'tuna pasta for lunch',
    'pork belly ramen', 'duck confit dinner', 'lamb kofta for dinner',
    'chicken tikka masala', 'prawn linguine', 'venison steak',
    'ham and cheese toastie', 'full english breakfast', 'chicken caesar salad',
    'fish tacos for dinner', 'sausage and mash', 'smoked salmon bagel',
    'beef rendang', 'goat curry for dinner', 'meat feast pizza',
  ],
  unknown: [
    'hello', 'hi there', 'what can you do', 'help me', 'good morning',
    'what is my footprint', 'which category is worst', 'how is my weekly progress',
    'i paid my rent', 'booked a meeting', 'sent an email', 'updated the spreadsheet',
    'the weather is nice today', 'tell me about yourself', 'what are my reduction opportunities',
    'show me the trend', 'explain the emission factors', 'who are you',
    'thanks', 'that is useful', 'how does this work', 'give me tips',
    'am i on track', 'set my target to 40', 'open the history page',
    'can you analyse my history', 'what time is it', 'where did you get these factors',
    'can you export my data', 'how accurate is the forecast',
    'i need to buy groceries', 'my phone battery is low', 'call me later',
    'what is the meaning of scope 3', 'who built this app',
    'show me a chart', 'can you predict next month',
  ],
};

export const CORPUS_SIZE = Object.values(CORPUS).reduce((a, b) => a + b.length, 0);
